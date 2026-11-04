import { fireEvent, render } from "@testing-library/react-native";
import { router } from "expo-router";
import PrivacySettingsScreen from "../PrivacySettingsScreen";
import { ROUTES } from "../../../routes";

jest.mock("../PreferencesScreen", () => () => null);
jest.mock("../../../components/Toast", () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock("../../../services/connectivity", () => ({
  useConnectivityStore: (select: (state: { online: boolean }) => unknown) => select({ online: true }),
}));

beforeEach(() => jest.clearAllMocks());

it("opens Export data from its own Settings row, apart from the Account group", () => {
  const view = render(<PrivacySettingsScreen accessToken="token" userId="user-1" deviceId="device-1" />);

  fireEvent.press(view.getByLabelText("Export data"));
  expect(router.push).toHaveBeenCalledWith(ROUTES.dataExport);

  fireEvent.press(view.getByLabelText("Delete account"));
  expect(router.push).toHaveBeenCalledWith(ROUTES.deleteAccount);
});
