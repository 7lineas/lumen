import { Link, Stack } from "expo-router";
import { Text, View } from "react-native";
import { Screen } from "@/components/design";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "No encontrado" }} />
      <Screen>
        <View className="gap-4 px-5 py-8">
          <Text className="text-2xl font-bold text-foreground">
            Ruta no encontrada
          </Text>
          <Link href="/">
            <Text className="font-semibold text-primary">Volver al inicio</Text>
          </Link>
        </View>
      </Screen>
    </>
  );
}
