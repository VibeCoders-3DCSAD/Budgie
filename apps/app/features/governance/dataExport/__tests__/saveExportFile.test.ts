jest.mock("expo-file-system", () => ({ Directory: { pickDirectoryAsync: jest.fn() } }));

import { Directory } from "expo-file-system";
import { saveExportFile } from "../saveExportFile";

const mockPick = Directory.pickDirectoryAsync as jest.Mock;

describe("saveExportFile on a device", () => {
  it("writes the CSV into the folder the user picks", async () => {
    const write = jest.fn();
    const createFile = jest.fn(() => ({ write }));
    mockPick.mockResolvedValue({ createFile });

    await expect(saveExportFile("budgie-export.csv", "a,b")).resolves.toEqual({ saved: true });
    expect(createFile).toHaveBeenCalledWith("budgie-export.csv", "text/csv");
    expect(write).toHaveBeenCalledWith("a,b");
  });

  it("saves nothing when the user closes the picker", async () => {
    mockPick.mockRejectedValue(new Error("cancelled"));

    await expect(saveExportFile("budgie-export.csv", "a,b")).resolves.toEqual({ saved: false });
  });
});
