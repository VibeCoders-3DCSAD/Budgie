import { useState } from "react";
import KebabMenu, { type KebabMenuProps } from "../../../components/KebabMenu";
import { useCloseWithTour } from "../hooks/useCloseWithTour";
import { TourTarget } from "./TourTarget";

type Props = Omit<KebabMenuProps, "open" | "onOpenChange" | "wrapButton" | "wrapMenu"> & { tourId: string };

// A KebabMenu the guided tour can point at: the button is `tourId`, and the open menu is `${tourId}-menu`.
// The menu closes when the tour leaves the step that shows it.
export function TourKebabMenu({ tourId, ...props }: Props) {
  const [open, setOpen] = useState(false);
  const menuId = `${tourId}-menu`;
  useCloseWithTour(menuId, open, () => setOpen(false));
  return (
    <KebabMenu
      {...props}
      open={open}
      onOpenChange={setOpen}
      wrapButton={(button) => <TourTarget id={tourId}>{button}</TourTarget>}
      wrapMenu={(menu, place) => <TourTarget id={menuId} style={place}>{menu}</TourTarget>}
    />
  );
}
