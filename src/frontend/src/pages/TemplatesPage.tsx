import React, { useState, useEffect } from "react";
import {
  Stack,
  Text,
  Spinner,
  MessageBar,
  MessageBarType,
  PrimaryButton,
  DefaultButton,
  DetailsList,
  DetailsListLayoutMode,
  IColumn,
  SelectionMode,
  Dialog,
  DialogFooter,
  DialogType,
  TextField,
  Dropdown,
  IDropdownOption,
  Pivot,
  PivotItem,
} from "@fluentui/react";
import { useSubscriptions } from "../hooks/useSubscriptions";
import { SubscriptionPicker } from "../components/SubscriptionPicker";
import {
  getTemplates,
  deleteTemplate,
  saveTemplate,
  applyTemplate,
  getGateways,
  exportTemplate,
  importTemplate,
} from "../services/api";
import { ConfigTemplate, GatewayListItem } from "../types";

export const TemplatesPage: React.FC = () => {
  const { subscriptions, selectedSubscription, setSelectedSubscription, loading: subLoading } = useSubscriptions();
  const [templates, setTemplates] = useState<ConfigTemplate[]>([]);
  const [gateways, setGateways] = useState<GatewayListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Save form
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [saveGateway, setSaveGateway] = useState("");
  const [saving, setSaving] = useState(false);

  // Apply dialog
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [applyTemplateId, setApplyTemplateId] = useState("");
  const [applyGateway, setApplyGateway] = useState("");
  const [applying, setApplying] = useState(false);

  // Delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteId, setDeleteId] = useState("");

  // Detail panel
  const [selectedTemplate, setSelectedTemplate] = useState<ConfigTemplate | null>(null);

  // Import
  const [importJson, setImportJson] = useState("");
  const [importing, setImporting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [t, g] = await Promise.all([
        getTemplates(),
        selectedSubscription ? getGateways(selectedSubscription) : Promise.resolve([]),
      ]);
      setTemplates(t);
      setGateways(g);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedSubscription]);

  const handleSave = async () => {
    if (!saveName || !saveGateway || !selectedSubscription) return;
    const gw = gateways.find((g) => g.name === saveGateway);
    if (!gw) return;

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await saveTemplate({
        subscriptionId: selectedSubscription,
        resourceGroup: gw.resourceGroup,
        gatewayName: gw.name,
        name: saveName,
        description: saveDescription,
      });
      setSuccess(`Template "${saveName}" saved successfully`);
      setSaveName("");
      setSaveDescription("");
      setSaveGateway("");
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const handleApply = async () => {
    if (!applyTemplateId || !applyGateway || !selectedSubscription) return;
    const gw = gateways.find((g) => g.name === applyGateway);
    if (!gw) return;

    setApplying(true);
    setError("");
    setSuccess("");
    try {
      await applyTemplate(applyTemplateId, {
        subscriptionId: selectedSubscription,
        resourceGroup: gw.resourceGroup,
        gatewayName: gw.name,
      });
      setSuccess(`Template applied to "${gw.name}" — update in progress (2-5 min)`);
      setShowApplyDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply template");
    } finally {
      setApplying(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTemplate(deleteId);
      setSuccess("Template deleted");
      setShowDeleteDialog(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete template");
    }
  };

  const handleExport = async (id: string) => {
    try {
      const exported = await exportTemplate(id);
      const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `template-${exported.template.name.replace(/\s+/g, "-").toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess("Template exported");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export template");
    }
  };

  const handleImport = async () => {
    if (!importJson) return;
    setImporting(true);
    setError("");
    try {
      const parsed = JSON.parse(importJson);
      const template = parsed.template || parsed;
      await importTemplate(template);
      setSuccess("Template imported successfully");
      setImportJson("");
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON or import failed");
    } finally {
      setImporting(false);
    }
  };

  const gatewayOptions: IDropdownOption[] = gateways.map((g) => ({
    key: g.name,
    text: `${g.name} (${g.resourceGroup})`,
  }));

  const columns: IColumn[] = [
    {
      key: "name",
      name: "Template Name",
      fieldName: "name",
      minWidth: 160,
      maxWidth: 220,
      onRender: (item: ConfigTemplate) => (
        <Text
          styles={{ root: { fontWeight: 600, color: "#0078d4", cursor: "pointer" } }}
          onClick={() => setSelectedTemplate(item)}
        >
          {item.name}
        </Text>
      ),
    },
    { key: "description", name: "Description", fieldName: "description", minWidth: 180, maxWidth: 280 },
    {
      key: "source",
      name: "Source Gateway",
      minWidth: 140,
      maxWidth: 200,
      onRender: (item: ConfigTemplate) => <Text>{item.sourceGateway.name}</Text>,
    },
    {
      key: "sku",
      name: "SKU",
      minWidth: 100,
      maxWidth: 120,
      onRender: (item: ConfigTemplate) => (
        <span className="template-component-count">{item.config.sku.name}</span>
      ),
    },
    {
      key: "pools",
      name: "Pools",
      minWidth: 60,
      maxWidth: 80,
      onRender: (item: ConfigTemplate) => (
        <span className="template-component-count">{item.config.backendAddressPools.length}</span>
      ),
    },
    {
      key: "listeners",
      name: "Listeners",
      minWidth: 70,
      maxWidth: 90,
      onRender: (item: ConfigTemplate) => (
        <span className="template-component-count">{item.config.httpListeners.length}</span>
      ),
    },
    {
      key: "rules",
      name: "Rules",
      minWidth: 60,
      maxWidth: 80,
      onRender: (item: ConfigTemplate) => (
        <span className="template-component-count">{item.config.requestRoutingRules.length}</span>
      ),
    },
    {
      key: "createdAt",
      name: "Created",
      minWidth: 130,
      maxWidth: 160,
      onRender: (item: ConfigTemplate) => (
        <Text variant="small">{new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</Text>
      ),
    },
    {
      key: "actions",
      name: "Actions",
      minWidth: 220,
      onRender: (item: ConfigTemplate) => (
        <Stack horizontal tokens={{ childrenGap: 8 }}>
          <PrimaryButton
            text="Apply"
            styles={{ root: { borderRadius: 6, minWidth: 0, padding: "0 12px" } }}
            onClick={() => {
              setApplyTemplateId(item.id);
              setShowApplyDialog(true);
            }}
          />
          <DefaultButton
            text="Export"
            iconProps={{ iconName: "Download" }}
            styles={{ root: { borderRadius: 6, minWidth: 0, padding: "0 12px" } }}
            onClick={() => handleExport(item.id)}
          />
          <DefaultButton
            text="Delete"
            styles={{ root: { borderRadius: 6, minWidth: 0, padding: "0 12px", color: "#d13438", borderColor: "#d13438" } }}
            onClick={() => {
              setDeleteId(item.id);
              setShowDeleteDialog(true);
            }}
          />
        </Stack>
      ),
    },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
          <Text variant="xxLarge" styles={{ root: { fontWeight: 700 } }}>
            Config Templates
          </Text>
        </Stack>
        <Text variant="medium" styles={{ root: { color: "#605e5c", marginTop: 4 } }}>
          Save and reuse gateway configurations across your infrastructure
        </Text>
      </div>

      <Stack horizontal tokens={{ childrenGap: 16 }} styles={{ root: { marginBottom: 20 } }}>
        <SubscriptionPicker
          subscriptions={subscriptions}
          selectedSubscription={selectedSubscription}
          onChange={setSelectedSubscription}
          loading={subLoading}
        />
      </Stack>

      {error && (
        <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError("")} styles={{ root: { marginBottom: 16 } }}>
          {error}
        </MessageBar>
      )}
      {success && (
        <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setSuccess("")} styles={{ root: { marginBottom: 16 } }}>
          {success}
        </MessageBar>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{templates.length}</div>
          <div className="stat-label">Total Templates</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "#107c10" }}>{gateways.length}</div>
          <div className="stat-label">Available Gateways</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "#8764b8" }}>
            {new Set(templates.map((t) => t.sourceGateway.name)).size}
          </div>
          <div className="stat-label">Source Gateways</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: 20, color: "#605e5c" }}>
            {templates.length > 0
              ? new Date(templates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0].createdAt).toLocaleDateString()
              : "—"}
          </div>
          <div className="stat-label">Latest Template</div>
        </div>
      </div>

      {loading ? (
        <Spinner label="Loading templates..." />
      ) : (
        <Pivot styles={{ root: { marginBottom: 16 } }}>
          <PivotItem headerText="Browse Templates" itemIcon="ViewList">
            <div className="card" style={{ marginTop: 16 }}>
              {templates.length === 0 ? (
                <div className="empty-state">
                  <h3>No templates yet</h3>
                  <p>Save your first template from the "Save Template" tab</p>
                </div>
              ) : (
                <DetailsList
                  items={templates}
                  columns={columns}
                  layoutMode={DetailsListLayoutMode.justified}
                  selectionMode={SelectionMode.none}
                />
              )}
            </div>
          </PivotItem>

          <PivotItem headerText="Save Template" itemIcon="Save">
            <div className="card" style={{ marginTop: 16, maxWidth: 600 }}>
              <Stack tokens={{ childrenGap: 16 }}>
                <Text variant="large" styles={{ root: { fontWeight: 600 } }}>
                  Save Gateway Config as Template
                </Text>
                <Dropdown
                  label="Source Gateway"
                  placeholder="Select a gateway"
                  options={gatewayOptions}
                  selectedKey={saveGateway}
                  onChange={(_, opt) => setSaveGateway(opt?.key as string || "")}
                  required
                />
                <TextField
                  label="Template Name"
                  placeholder="e.g., Production WAF Config"
                  value={saveName}
                  onChange={(_, v) => setSaveName(v || "")}
                  required
                />
                <TextField
                  label="Description"
                  placeholder="What does this template configure?"
                  value={saveDescription}
                  onChange={(_, v) => setSaveDescription(v || "")}
                  multiline
                  rows={3}
                />
                <PrimaryButton
                  text={saving ? "Saving..." : "Save as Template"}
                  disabled={!saveName || !saveGateway || saving}
                  onClick={handleSave}
                  styles={{ root: { borderRadius: 6, maxWidth: 200 } }}
                />
              </Stack>
            </div>
          </PivotItem>

          <PivotItem headerText="Import Template" itemIcon="Upload">
            <div className="card" style={{ marginTop: 16, maxWidth: 600 }}>
              <Stack tokens={{ childrenGap: 16 }}>
                <Text variant="large" styles={{ root: { fontWeight: 600 } }}>
                  Import Template from JSON
                </Text>
                <Text variant="small" styles={{ root: { color: "#605e5c" } }}>
                  Paste a previously exported template JSON to import it into your template library.
                </Text>
                <TextField
                  label="Template JSON"
                  placeholder='Paste exported template JSON here...'
                  value={importJson}
                  onChange={(_, v) => setImportJson(v || "")}
                  multiline
                  rows={10}
                  styles={{ field: { fontFamily: "'Cascadia Code', 'Consolas', monospace", fontSize: 12 } }}
                />
                <PrimaryButton
                  text={importing ? "Importing..." : "Import Template"}
                  disabled={!importJson || importing}
                  onClick={handleImport}
                  styles={{ root: { borderRadius: 6, maxWidth: 200 } }}
                />
              </Stack>
            </div>
          </PivotItem>
        </Pivot>
      )}

      {/* Detail Panel */}
      {selectedTemplate && (
        <Dialog
          hidden={false}
          onDismiss={() => setSelectedTemplate(null)}
          dialogContentProps={{
            type: DialogType.largeHeader,
            title: selectedTemplate.name,
            subText: selectedTemplate.description,
          }}
          maxWidth={600}
        >
          <Stack tokens={{ childrenGap: 12 }}>
            <Text variant="medium" styles={{ root: { fontWeight: 600 } }}>Configuration Summary</Text>
            <div className="template-config-preview">
              <div>SKU: {selectedTemplate.config.sku.name} / {selectedTemplate.config.sku.tier}</div>
              <div>Backend Pools: {selectedTemplate.config.backendAddressPools.length}</div>
              <div>HTTP Settings: {selectedTemplate.config.backendHttpSettingsCollection.length}</div>
              <div>Listeners: {selectedTemplate.config.httpListeners.length}</div>
              <div>Routing Rules: {selectedTemplate.config.requestRoutingRules.length}</div>
              <div>Health Probes: {selectedTemplate.config.probes.length}</div>
              <div>Frontend Ports: {selectedTemplate.config.frontendPorts.length}</div>
              <div>WAF Config: {selectedTemplate.config.wafConfiguration ? "Yes" : "No"}</div>
              <div>Tags: {Object.keys(selectedTemplate.config.tags).length}</div>
            </div>
            <Text variant="small" styles={{ root: { color: "#605e5c" } }}>
              Source: {selectedTemplate.sourceGateway.name} | Created: {new Date(selectedTemplate.createdAt).toLocaleString()} | By: {selectedTemplate.createdBy}
            </Text>
          </Stack>
          <DialogFooter>
            <DefaultButton text="Close" onClick={() => setSelectedTemplate(null)} />
          </DialogFooter>
        </Dialog>
      )}

      {/* Apply Dialog */}
      <Dialog
        hidden={!showApplyDialog}
        onDismiss={() => setShowApplyDialog(false)}
        dialogContentProps={{
          type: DialogType.normal,
          title: "Apply Template",
          subText: "This will replace the target gateway's configuration. The gateway will update (2-5 min).",
        }}
      >
        <Dropdown
          label="Target Gateway"
          placeholder="Select a gateway"
          options={gatewayOptions}
          selectedKey={applyGateway}
          onChange={(_, opt) => setApplyGateway(opt?.key as string || "")}
          required
        />
        <DialogFooter>
          <PrimaryButton
            text={applying ? "Applying..." : "Apply"}
            disabled={!applyGateway || applying}
            onClick={handleApply}
          />
          <DefaultButton text="Cancel" onClick={() => setShowApplyDialog(false)} />
        </DialogFooter>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        hidden={!showDeleteDialog}
        onDismiss={() => setShowDeleteDialog(false)}
        dialogContentProps={{
          type: DialogType.normal,
          title: "Delete Template",
          subText: "Are you sure you want to delete this template? This cannot be undone.",
        }}
      >
        <DialogFooter>
          <PrimaryButton text="Delete" onClick={handleDelete} styles={{ root: { background: "#d13438", borderColor: "#d13438" } }} />
          <DefaultButton text="Cancel" onClick={() => setShowDeleteDialog(false)} />
        </DialogFooter>
      </Dialog>
    </div>
  );
};
