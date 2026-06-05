/** @vitest-environment jsdom */

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlantCard } from "../../src/components/PlantCard";

vi.mock("../../src/services/api", () => ({
  fetchPlantSnapshot: vi.fn().mockResolvedValue({}),
  getMoistureEndpoint: vi.fn(() => "/api/plants/test/readings"),
}));

describe("PlantCard security", () => {
  it("renders malicious plant names as text, not executable HTML", () => {
    const maliciousName = "<img src=x onerror=alert(1)>";
    const { container } = render(
      <PlantCard
        plant={{
          id: "test-id",
          uuid: "test-id",
          name: maliciousName,
          wetThreshold: 1500,
          moisture: 50,
          lastUpdated: new Date().toISOString(),
          latestRawValue: 1200,
          source: "api",
        }}
        onManage={() => {}}
        onOpenHistory={() => {}}
      />,
    );

    expect(screen.getByText(maliciousName)).toBeInTheDocument();
    expect(container.querySelector("img[src='x']")).toBeNull();
  });
});
