import { describe, expect, it } from "vitest";
import { loadConfig, s3Configured } from "../src/config.js";

const BASE_ENV = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/postgres",
  JWT_SECRET: "x".repeat(40),
};

const FULL_S3 = {
  S3_ENDPOINT: "https://s3.ru1.storage.beget.cloud",
  S3_REGION: "ru1",
  S3_BUCKET: "5a7714ba6fb4-xtrud",
  S3_ACCESS_KEY: "A".repeat(20),
  S3_SECRET_KEY: "B".repeat(40),
};

describe("конфигурация хранилища", () => {
  it("без настроек файлы остаются на диске", () => {
    const cfg = loadConfig({ ...BASE_ENV } as unknown as NodeJS.ProcessEnv);
    expect(s3Configured(cfg)).toBe(false);
  });

  it("не стартует, если хранилище задано наполовину", () => {
    // Загрузка ушла бы на диск, а ссылка вела бы в хранилище — файлы
    // «пропадали» бы молча. Лучше не подняться.
    expect(() =>
      loadConfig({
        ...BASE_ENV,
        S3_ENDPOINT: FULL_S3.S3_ENDPOINT,
        S3_BUCKET: FULL_S3.S3_BUCKET,
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/наполовину/);
  });

  it("принимает полную настройку", () => {
    const cfg = loadConfig({ ...BASE_ENV, ...FULL_S3 } as unknown as NodeJS.ProcessEnv);
    expect(s3Configured(cfg)).toBe(true);
    expect(cfg.S3_REGION).toBe("ru1");
  });

  it("отвергает адрес хранилища, который не является ссылкой", () => {
    expect(() =>
      loadConfig({
        ...BASE_ENV,
        ...FULL_S3,
        S3_ENDPOINT: "s3.ru1.storage.beget.cloud",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/S3_ENDPOINT/);
  });
});
