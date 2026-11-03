import React from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Platform, View } from "react-native";
import { Banner, FormCard, PickerField } from "../../../../components/BudgieForm";
import { formatDeviceDate } from "../../../../lib/dates";
import { Button } from "../../components/debtUi";
import type { CycleEditor } from "../../hooks/useCycleEditor";

type Props = { editor: CycleEditor; today: string };

// The add or override form for one billing cycle. Renders nothing while no cycle is being edited.
export default function CreditCardCycleEditor({ editor, today }: Props) {
  if (!editor.editing) return null;
  const pickedDate = editor.picker === "start" ? editor.start : editor.cutoff;

  return (
    <FormCard title={editor.editing.cycle ? "Override billing cycle" : "Add billing cycle"}>
      <PickerField label="Cycle start" accessibilityLabel="Billing-cycle start date" value={editor.start || "Select billing-cycle start date"} placeholder={!editor.start} onPress={() => editor.setPicker("start")} />
      <PickerField label="Cut-off" accessibilityLabel="Cut-off date" value={editor.cutoff || "Select cut-off date"} placeholder={!editor.cutoff} onPress={() => editor.setPicker("cutoff")} error={Boolean(editor.error)} />
      {editor.picker ? <DateTimePicker value={new Date(`${pickedDate || today}T12:00:00`)} mode="date" display={Platform.OS === "ios" ? "spinner" : "default"} onChange={(event, date) => {
        if (event.type === "set" && date && editor.picker) editor.setDate(editor.picker, formatDeviceDate(date));
        if (Platform.OS !== "ios") editor.setPicker(null);
      }} /> : null}
      {editor.error ? <Banner tone="error">{editor.error}</Banner> : null}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button flex variant="ghost" label="Cancel" onPress={editor.close} />
        <Button flex label={editor.saving ? "Saving..." : "Save cycle"} disabled={editor.saving} onPress={() => { editor.save().catch(() => {}); }} />
      </View>
    </FormCard>
  );
}
