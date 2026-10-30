import type { PropsWithChildren } from "react";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";

/**
 * The operator UI is always dark: it is used in a dim sanctuary, where a bright
 * phone screen is distracting. Mount once via `AppProviders`.
 */
export function ThemeProvider({ children }: PropsWithChildren) {
  return (
    <View className="dark flex-1 bg-background">
      <StatusBar style="light" />
      {children}
    </View>
  );
}
