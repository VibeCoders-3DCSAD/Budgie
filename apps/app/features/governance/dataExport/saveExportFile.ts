import { Platform } from "react-native";
import { Directory } from "expo-file-system";

export type SaveResult = { saved: true } | { saved: false };

const CSV_MIME = "text/csv";

// The browser downloads the file to wherever the user's browser saves downloads.
function downloadInBrowser(fileName: string, csv: string): SaveResult {
  const url = URL.createObjectURL(new Blob([csv], { type: `${CSV_MIME};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking at once can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return { saved: true };
}

// The system folder picker lets the user choose where the file goes. Closing the picker saves nothing.
async function saveToPickedFolder(fileName: string, csv: string): Promise<SaveResult> {
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch {
    return { saved: false };
  }
  const file = folder.createFile(fileName, CSV_MIME);
  file.write(csv);
  return { saved: true };
}

export function saveExportFile(fileName: string, csv: string): Promise<SaveResult> {
  if (Platform.OS === "web") return Promise.resolve(downloadInBrowser(fileName, csv));
  return saveToPickedFolder(fileName, csv);
}
