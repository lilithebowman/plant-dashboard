/** @vitest-environment jsdom */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddPlantForm } from "../../src/components/AddPlantForm";

vi.mock("../../src/utils/uuid", () => ({
  generateUuid: vi.fn(() => "11111111-1111-4111-8111-111111111111"),
}));

describe("AddPlantForm", () => {
  it("submits trimmed values", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<AddPlantForm onCreate={onCreate} />);

    fireEvent.change(
      screen.getByPlaceholderText("Lil's Flailing Green Goblin"),
      {
        target: { value: "  My Plant  " },
      },
    );
    fireEvent.change(screen.getByPlaceholderText("e.g. 7f2c1c3a-..."), {
      target: { value: "  22222222-2222-4222-8222-222222222222  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add plant" }));

    expect(onCreate).toHaveBeenCalledWith({
      name: "My Plant",
      uuid: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("does not submit blank or whitespace-only input", () => {
    const onCreate = vi.fn();
    render(<AddPlantForm onCreate={onCreate} />);

    fireEvent.change(
      screen.getByPlaceholderText("Lil's Flailing Green Goblin"),
      {
        target: { value: "   " },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add plant" }));

    expect(onCreate).not.toHaveBeenCalled();
  });
});
