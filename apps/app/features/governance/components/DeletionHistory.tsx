import { ArrowCounterClockwise, ClockCountdown, HourglassMedium, type Icon } from "phosphor-react-native";
import type { AccountDeletionRequest } from "../types";
import { GroupLabel, ListCard, ListRow, formatShortDate } from "./governanceUi";
import type { RowValueTone, TileTone } from "./governanceUi";

type RowLook = { icon: Icon; tone: TileTone; value: string; valueTone: RowValueTone; subtitle: string };

// How each request reads in the history: what happened to it and when.
function rowLook(request: AccountDeletionRequest): RowLook {
  if (request.status === "cancelled") {
    const subtitle = request.cancelled_at ? `Cancelled ${formatShortDate(request.cancelled_at)}` : "Cancelled";
    return { icon: ArrowCounterClockwise, tone: "grey", value: "Cancelled", valueTone: "mut", subtitle };
  }
  if (request.status === "processing") {
    return { icon: ClockCountdown, tone: "red", value: "Pending", valueTone: "err", subtitle: `Scheduled for ${formatShortDate(request.scheduled_delete_at)}` };
  }
  return { icon: HourglassMedium, tone: "grey", value: "Not confirmed", valueTone: "mut", subtitle: "The request was never confirmed" };
}

// Request history on the Delete account page. Hidden when the user has never asked to delete their account.
export function DeletionHistory({ requests }: { requests: AccountDeletionRequest[] }) {
  if (requests.length === 0) return null;
  return (
    <>
      <GroupLabel>Request history</GroupLabel>
      <ListCard>
        {requests.map((request, index) => {
          const look = rowLook(request);
          return (
            <ListRow
              key={request.id}
              icon={look.icon}
              tone={look.tone}
              title={`Requested ${formatShortDate(request.requested_at)}`}
              subtitle={look.subtitle}
              value={look.value}
              valueTone={look.valueTone}
              divider={index > 0}
            />
          );
        })}
      </ListCard>
    </>
  );
}
