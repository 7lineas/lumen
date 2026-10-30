import type { PropsWithChildren } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/theme/tokens";

/** Page base: theme background and safe area. */
export function Screen({ children }: PropsWithChildren) {
  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={["top", "left", "right", "bottom"]}
    >
      {children}
    </SafeAreaView>
  );
}

/** Surface for a group of related controls. */
export function Card({ children }: PropsWithChildren) {
  return (
    <View className="gap-4 rounded-lg border border-border bg-card p-4">
      {children}
    </View>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost";

const BUTTON_SURFACE: Record<ButtonVariant, string> = {
  primary: "bg-primary",
  secondary: "border border-border bg-secondary",
  ghost: "bg-transparent",
};

const BUTTON_LABEL: Record<ButtonVariant, string> = {
  primary: "text-primary-foreground",
  secondary: "text-foreground",
  ghost: "text-muted-foreground",
};

export function Button({
  label,
  onPress,
  variant = "secondary",
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-12 flex-1 items-center justify-center rounded-md px-4 active:opacity-80 ${BUTTON_SURFACE[variant]} ${disabled ? "opacity-40" : ""}`}
    >
      <Text className={`font-sans-semibold text-base ${BUTTON_LABEL[variant]}`}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({ label, ...input }: TextInputProps & { label: string }) {
  return (
    <View className="gap-2">
      <Text className="font-sans-medium text-sm text-muted-foreground">
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.placeholder}
        className="rounded-md border border-input bg-background px-4 py-3 font-sans text-lg text-foreground"
        {...input}
      />
    </View>
  );
}

/** Inline error line, shown under the control that failed. */
export function ErrorText({ children }: PropsWithChildren) {
  return (
    <Text
      accessibilityLiveRegion="polite"
      className="font-sans-medium text-sm text-destructive"
    >
      {children}
    </Text>
  );
}
