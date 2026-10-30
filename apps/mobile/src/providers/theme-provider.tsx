import type { PropsWithChildren } from "react";
import { View } from "react-native";
import { useColorScheme } from "nativewind";
import { StatusBar } from "expo-status-bar";

/** Follows the phone's light or dark setting. Mount once via `AppProviders`. */
export function ThemeProvider({ children }: PropsWithChildren) {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === "dark";

  return (
    <View
      className={dark ? "dark flex-1 bg-background" : "flex-1 bg-background"}
    >
      <StatusBar style={dark ? "light" : "dark"} />
      {children}
    </View>
  );
}
