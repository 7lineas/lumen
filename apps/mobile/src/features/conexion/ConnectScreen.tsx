import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Button, Card, ErrorText, Field, Screen } from "@/components/design";
import { normalizeHostAddress } from "@/lib/host-address";
import { describeLumenError } from "@/lib/lumen-errors";
import { parsePairingLink } from "@/lib/pairing-link";
import { useLumenSession } from "@/providers/session-provider";

const NOT_LUMEN_QR =
  "Ese código no es de Lumen. En Lumen abra Ajustes → Acceso desde otros dispositivos.";

export function ConnectScreen() {
  const { pair } = useLumenSession();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const connect = async (origin: string, accessCode: string) => {
    setError(null);
    setBusy(true);
    try {
      await pair(origin, accessCode);
    } catch (cause) {
      setError(describeLumenError(cause));
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    // A pasted QR link carries its own address and code.
    const link = parsePairingLink(address);
    if (link) {
      void connect(link.origin, link.code);
      return;
    }
    const origin = normalizeHostAddress(address);
    if (!origin) {
      setError("Escriba una dirección como 192.168.1.20 o 100.101.102.103.");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError("El código tiene seis dígitos.");
      return;
    }
    void connect(origin, code);
  };

  const onScan = ({ data }: { data: string }) => {
    // The camera can report the same code several times; the first valid one wins.
    if (busy) return;
    const link = parsePairingLink(data);
    setScanning(false);
    if (!link) {
      setError(NOT_LUMEN_QR);
      return;
    }
    void connect(link.origin, link.code);
  };

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="gap-5 px-5 py-8"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-3">
          <Text className="font-serif-medium text-4xl leading-tight text-foreground">
            Conectar con Lumen
          </Text>
          <Text className="font-sans text-base leading-6 text-muted-foreground">
            En el equipo de proyección abra Lumen y vaya a Ajustes → Acceso
            desde otros dispositivos. Escanee el código QR. Puede estar en la
            misma red Wi-Fi o, desde otra red, con Tailscale encendido en ambos
            equipos.
          </Text>
        </View>

        <Card>
          {scanning ? (
            permission?.granted ? (
              <View className="h-72 overflow-hidden rounded-md">
                <CameraView
                  style={{ flex: 1 }}
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={onScan}
                />
              </View>
            ) : permission?.canAskAgain ? (
              <Button
                label="Permitir la cámara"
                variant="primary"
                onPress={() => void requestPermission()}
              />
            ) : (
              <ErrorText>
                Active la cámara para Lumen en los ajustes del teléfono.
              </ErrorText>
            )
          ) : null}
          <Button
            label={scanning ? "Cancelar escaneo" : "Escanear código QR"}
            variant={scanning ? "secondary" : "primary"}
            disabled={busy}
            onPress={() => {
              setError(null);
              setScanning((on) => !on);
            }}
          />
        </Card>

        <Card>
          <Text className="font-sans-semibold text-lg text-foreground">
            O escriba los datos
          </Text>
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
            variant="secondary"
            disabled={busy}
            onPress={submit}
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}
