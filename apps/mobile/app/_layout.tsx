import "../global.css";
import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { AppProviders } from "@/providers/app-providers";
import { useLumenSession } from "@/providers/session-provider";

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { status } = useLumenSession();
  const paired = status === "paired";

  useEffect(() => {
    if (status !== "loading") void SplashScreen.hideAsync();
  }, [status]);

  if (status === "loading") return null;

  return (
    <Stack screenOptions={{ headerShown: false, animation: "none" }}>
      <Stack.Protected guard={paired}>
        <Stack.Screen name="operar" />
      </Stack.Protected>
      <Stack.Protected guard={!paired}>
        <Stack.Screen name="conectar" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}
