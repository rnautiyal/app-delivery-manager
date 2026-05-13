import {
  ElasticLoadBalancingV2Client,
  DescribeLoadBalancersCommand,
  DescribeListenersCommand,
  DescribeTargetGroupsCommand,
  DescribeTargetHealthCommand,
  DescribeRulesCommand,
  LoadBalancer,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { logger } from "../config/logger";

const AWS_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-west-1", "eu-west-2", "eu-central-1",
  "ap-southeast-1", "ap-southeast-2", "ap-northeast-1",
];

export interface AlbItem {
  arn: string;
  name: string;
  dnsName: string;
  scheme: string; // internet-facing or internal
  type: string; // application
  state: string;
  vpcId: string;
  createdTime: string;
  region: string;
  availabilityZones: string[];
  securityGroups: string[];
}

export class AwsAlbService {
  private getClient(region: string): ElasticLoadBalancingV2Client {
    return new ElasticLoadBalancingV2Client({
      region,
      credentials: process.env.AWS_ACCESS_KEY_ID ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      } : undefined, // fall back to default credential chain
    });
  }

  isConfigured(): boolean {
    return !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  }

  getRegions(): string[] {
    const envRegions = process.env.AWS_REGIONS;
    if (envRegions) return envRegions.split(",").map((r) => r.trim());
    return AWS_REGIONS;
  }

  async listAlbsAcrossRegions(regions?: string[]): Promise<AlbItem[]> {
    const regionList = regions || this.getRegions();
    const allAlbs: AlbItem[] = [];

    for (const region of regionList) {
      try {
        const client = this.getClient(region);
        const resp = await client.send(new DescribeLoadBalancersCommand({}));
        const albs = (resp.LoadBalancers || [])
          .filter((lb: LoadBalancer) => lb.Type === "application")
          .map((lb: LoadBalancer) => this.mapAlb(lb, region));
        allAlbs.push(...albs);
      } catch (error: any) {
        logger.warn("Failed to list ALBs in region", { region, error: error.message });
      }
    }

    return allAlbs;
  }

  async listAlbs(region: string): Promise<AlbItem[]> {
    try {
      const client = this.getClient(region);
      const resp = await client.send(new DescribeLoadBalancersCommand({}));
      return (resp.LoadBalancers || [])
        .filter((lb: LoadBalancer) => lb.Type === "application")
        .map((lb: LoadBalancer) => this.mapAlb(lb, region));
    } catch (error: any) {
      logger.error("Failed to list ALBs", { region, error: error.message });
      throw error;
    }
  }

  async getAlbDetails(region: string, arn: string): Promise<any> {
    try {
      const client = this.getClient(region);

      // Get load balancer
      const lbResp = await client.send(new DescribeLoadBalancersCommand({ LoadBalancerArns: [arn] }));
      const lb = lbResp.LoadBalancers?.[0];
      if (!lb) throw new Error("ALB not found");

      // Get listeners
      const listenersResp = await client.send(new DescribeListenersCommand({ LoadBalancerArn: arn }));
      const listeners = listenersResp.Listeners || [];

      // Get target groups
      const tgResp = await client.send(new DescribeTargetGroupsCommand({ LoadBalancerArn: arn }));
      const targetGroups = tgResp.TargetGroups || [];

      // Get target health for each target group
      const targetGroupsWithHealth = await Promise.all(
        targetGroups.map(async (tg) => {
          try {
            const healthResp = await client.send(new DescribeTargetHealthCommand({ TargetGroupArn: tg.TargetGroupArn }));
            return {
              ...tg,
              targets: (healthResp.TargetHealthDescriptions || []).map((t) => ({
                id: t.Target?.Id,
                port: t.Target?.Port,
                health: t.TargetHealth?.State,
                reason: t.TargetHealth?.Reason,
                description: t.TargetHealth?.Description,
              })),
            };
          } catch {
            return { ...tg, targets: [] };
          }
        })
      );

      // Get rules for each listener
      const listenersWithRules = await Promise.all(
        listeners.map(async (l) => {
          try {
            const rulesResp = await client.send(new DescribeRulesCommand({ ListenerArn: l.ListenerArn }));
            return { ...l, rules: rulesResp.Rules || [] };
          } catch {
            return { ...l, rules: [] };
          }
        })
      );

      return {
        ...this.mapAlb(lb, region),
        listeners: listenersWithRules.map((l: any) => ({
          arn: l.ListenerArn,
          protocol: l.Protocol,
          port: l.Port,
          sslPolicy: l.SslPolicy,
          certificates: (l.Certificates || []).map((c: any) => c.CertificateArn),
          defaultActions: l.DefaultActions,
          rulesCount: l.rules.length,
          rules: l.rules.map((r: any) => ({
            priority: r.Priority,
            conditions: r.Conditions,
            actions: r.Actions,
            isDefault: r.IsDefault,
          })),
        })),
        targetGroups: targetGroupsWithHealth.map((tg: any) => ({
          arn: tg.TargetGroupArn,
          name: tg.TargetGroupName,
          protocol: tg.Protocol,
          port: tg.Port,
          targetType: tg.TargetType,
          healthCheckProtocol: tg.HealthCheckProtocol,
          healthCheckPath: tg.HealthCheckPath,
          healthCheckPort: tg.HealthCheckPort,
          healthCheckInterval: tg.HealthCheckIntervalSeconds,
          healthyThresholdCount: tg.HealthyThresholdCount,
          unhealthyThresholdCount: tg.UnhealthyThresholdCount,
          targets: tg.targets,
        })),
      };
    } catch (error: any) {
      logger.error("Failed to get ALB details", { arn, error: error.message });
      throw error;
    }
  }

  private mapAlb(lb: LoadBalancer, region: string): AlbItem {
    return {
      arn: lb.LoadBalancerArn || "",
      name: lb.LoadBalancerName || "",
      dnsName: lb.DNSName || "",
      scheme: lb.Scheme || "",
      type: lb.Type || "",
      state: lb.State?.Code || "unknown",
      vpcId: lb.VpcId || "",
      createdTime: lb.CreatedTime?.toISOString() || "",
      region,
      availabilityZones: (lb.AvailabilityZones || []).map((az: any) => az.ZoneName).filter(Boolean),
      securityGroups: lb.SecurityGroups || [],
    };
  }
}
