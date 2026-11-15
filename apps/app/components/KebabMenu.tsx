import { useRef, useState, type ReactElement, type ReactNode } from "react";
import { Modal, Pressable, Text, View, useWindowDimensions, type ViewStyle } from "react-native";
import { DotsThree, DotsThreeVertical, PencilSimple, TrashSimple } from "phosphor-react-native";

export type KebabAction = {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
};

// The wrapped element is a pressable; wrappers may chain onto its onPress.
type PressableElement = ReactElement<{ onPress?: (...args: unknown[]) => void }>;

export type KebabMenuProps = {
  kebabDirection?: "horizontal" | "vertical";
  tooltipLocation?: "topRight" | "bottomRight" | "topLeft" | "bottomLeft";
  disabled?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  actions?: KebabAction[];
  // Controls the menu from outside; left unset, the menu keeps its own open state.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // Wrap the button, or the open menu at its screen position, without this component knowing who wraps it.
  wrapButton?: (button: PressableElement) => ReactNode;
  wrapMenu?: (menu: PressableElement, place: ViewStyle) => ReactNode;
};

const defaultWrapMenu = (menu: PressableElement, place: ViewStyle) => <View style={place}>{menu}</View>;

export default function KebabMenu({ kebabDirection = "vertical", tooltipLocation = "bottomRight", disabled = false, onEdit, onDelete, actions, open: openProp, onOpenChange, wrapButton, wrapMenu = defaultWrapMenu }: KebabMenuProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<View>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const menuActions = actions ?? [
    { label: "Edit", icon: <PencilSimple size={17} color="#414942" />, onClick: onEdit ?? (() => {}) },
    { label: "Delete", icon: <TrashSimple size={17} color="#D9001F" />, onClick: onDelete ?? (() => {}) },
  ];
  const button = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="More actions"
      accessibilityState={{ disabled }}
      ref={buttonRef}
      disabled={disabled}
      onPress={(event) => {
        event.stopPropagation();
        buttonRef.current?.measureInWindow((x, y, width, height) => {
        const menuWidth = 150;
        const menuHeight = menuActions.length * 41 + 12;
        const gap = 8;
        const requestedTop = tooltipLocation.startsWith("top");
        const requestedRight = tooltipLocation.endsWith("Right");
        const fitsAbove = y - menuHeight - gap >= 8;
        const fitsBelow = y + height + menuHeight + gap <= screenHeight - 8;
        const fitsLeft = x + width - menuWidth >= 8;
        const fitsRight = x + menuWidth <= screenWidth - 8;
        const openAbove = requestedTop ? (fitsAbove || !fitsBelow) : (!fitsBelow && fitsAbove);
        const alignRight = requestedRight ? (fitsLeft || !fitsRight) : (!fitsRight && fitsLeft);
        const left = alignRight ? x + width - menuWidth : x;
        const top = openAbove ? y - menuHeight - gap : y + height + gap;
        setMenuPosition({
          top: Math.min(Math.max(8, top), screenHeight - menuHeight - 8),
          left: Math.min(Math.max(8, left), screenWidth - menuWidth - 8),
        });
        setOpen(true);
        });
      }}
      hitSlop={8}
      style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.45 : 1 }}
    >
      {kebabDirection === "vertical" ? <DotsThreeVertical size={22} color="#6B7A6F" weight="bold" /> : <DotsThree size={22} color="#6B7A6F" weight="bold" />}
    </Pressable>
  );
  const menu = (
    <Pressable onPress={(event) => event.stopPropagation()} style={{ minWidth: 150, padding: 6, borderRadius: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#EAEAE6", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 12, elevation: 4 }}>
      {menuActions.map((action) => (
        <Pressable key={action.label} onPress={(event) => {
          event.stopPropagation();
          action.onClick();
          setOpen(false);
        }} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 9 }}>
          {action.icon}
          <Text style={{ fontFamily: "Manrope", fontSize: 13, fontWeight: "600", color: action.label.toLowerCase() === "delete" ? "#D9001F" : "#1B1C1A" }}>{action.label}</Text>
        </Pressable>
      ))}
    </Pressable>
  );
  const menuPlace: ViewStyle = { position: "absolute", top: menuPosition.top, left: menuPosition.left };

  return (
    <>
      {wrapButton ? wrapButton(button) : button}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "rgba(27,28,26,0.12)" }}>
          {wrapMenu(menu, menuPlace)}
        </Pressable>
      </Modal>
    </>
  );
}
