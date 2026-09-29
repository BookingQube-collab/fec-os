"use client";

import * as React from "react";

import SquishSwitch from "@/components/react-bits/squish-switch";

/** Radix-shaped switch backed by the React Bits Micro Squish Switch. */
export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, defaultChecked, onCheckedChange, disabled, className, id, "aria-label": ariaLabel },
  _ref,
) {
  return (
    <SquishSwitch
      checked={checked}
      defaultChecked={defaultChecked}
      onChange={onCheckedChange}
      disabled={disabled}
      className={className}
      id={id}
      ariaLabel={ariaLabel}
      width={52}
      height={28}
      radius={14}
    />
  );
});

export { Switch };
