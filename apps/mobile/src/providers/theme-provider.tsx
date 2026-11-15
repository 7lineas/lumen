import type { PropsWithChildren } from "react";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";

export function ThemeProvider({ children }: PropsWithChildren) {
  return (
    <View className="dark flex-1 bg-background">
      <StatusBar style="light" />
      {children}
    </View>
  );
}
