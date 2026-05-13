import fs from "fs";
import path from "path";
import { logger } from "../config/logger";

export class StorageService<T extends { id: string }> {
  private filePath: string;

  constructor(filename: string) {
    const dataDir = process.env.DATA_DIR || path.join(__dirname, "../../data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.filePath = path.join(dataDir, filename);
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, "[]", "utf-8");
    }
  }

  readAll(): T[] {
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      return JSON.parse(raw) as T[];
    } catch (error) {
      logger.error("Failed to read storage file", { file: this.filePath, error });
      return [];
    }
  }

  writeAll(data: T[]): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      logger.error("Failed to write storage file", { file: this.filePath, error });
      throw error;
    }
  }

  findById(id: string): T | undefined {
    return this.readAll().find((item) => item.id === id);
  }

  add(item: T): void {
    const data = this.readAll();
    data.push(item);
    this.writeAll(data);
  }

  update(id: string, updated: T): void {
    const data = this.readAll();
    const index = data.findIndex((item) => item.id === id);
    if (index === -1) throw new Error(`Item not found: ${id}`);
    data[index] = updated;
    this.writeAll(data);
  }

  remove(id: string): void {
    const data = this.readAll().filter((item) => item.id !== id);
    this.writeAll(data);
  }
}
