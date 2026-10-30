import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button, Card, ErrorText, Field, Screen } from "@/components/design";
import { normalizeHostAddress } from "@/lib/host-address";
import { describeLumenError } from "@/lib/lumen-errors";
import { useLumenSession } from "@/providers/session-provider";

export function ConnectScreen() {
  const { pair } = useLumenSession();
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const origin = normalizeHostAddress(address);
    if (!origin) {
      setError("Escriba una dirección como 192.168.1.20 o 192.168.1.20:43124.");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError("El código tiene seis dígitos.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await pair(origin, code);
    } catch (cause) {
      setError(describeLumenError(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="gap-5 px-5 py-8"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-2">
          <Text className="text-3xl font-bold text-foreground">
            Conectar con Lumen
          </Text>
          <Text className="text-base leading-6 text-muted-foreground">
            En el equipo de proyección abra Lumen, vaya a Ajustes → Acceso desde
            otros dispositivos y escriba aquí la dirección y el código de seis
            dígitos. Ambos equipos deben estar en la misma red.
          </Text>
        </View>

        <Card>
          <Field
            label="Dirección de Lumen"
            value={address}
            onChangeText={setAddress}
            placeholder="192.168.1.20"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Field
            label="Código de acceso"
            value={code}
            onChangeText={(next) =>
              setCode(next.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="000000"
            keyboardType="number-pad"
            maxLength={6}
          />
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button
            label={busy ? "Conectando…" : "Conectar"}
            variant="primary"
            disabled={busy}
            onPress={() => void submit()}
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}
