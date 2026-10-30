import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import type { ProjectorPayload } from "@shared/types";
import { Button, Card, ErrorText, Field, Screen } from "@/components/design";
import { useLumenSession } from "@/providers/session-provider";
import { useBibleStage, type StagedVerse } from "./use-bible-stage";
import { useLiveProjector } from "./use-live-projector";

/** What the projector shows: a short title, plus scripture text when there is some. */
function describeLive(
  payload: ProjectorPayload | null,
  connected: boolean,
): { title: string; body?: string } {
  if (!payload) {
    return {
      title: connected ? "Nada proyectado todavía." : "Conectando con Lumen…",
    };
  }
  switch (payload.mode) {
    case "blank":
      return { title: "Pantalla negra" };
    case "verse":
      return {
        title: payload.referenceLabel,
        body: payload.blocks.map((block) => block.text).join(" "),
      };
    case "logo":
      return { title: "Logo de la iglesia" };
    case "slides":
      return { title: "Diapositiva" };
    case "video":
      return { title: "Video" };
    case "countdown":
      return { title: "Cuenta regresiva" };
    default:
      return { title: payload.mode };
  }
}

function StagedPreview({ staged }: { staged: StagedVerse }) {
  return (
    <View className="gap-4 border-t border-border pt-4">
      <Text className="font-serif-medium text-2xl text-foreground">
        {staged.referenceLabel}
      </Text>
      {staged.blocks.map((block, index) => (
        <View key={index} className="gap-1">
          {block.label ? (
            <Text className="font-sans-medium text-sm text-muted-foreground">
              {block.label}
            </Text>
          ) : null}
          <Text className="font-serif text-xl leading-8 text-foreground">
            {block.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function OperatorScreen() {
  const { session, client, forget } = useLumenSession();
  const live = useLiveProjector();
  const stage = useBibleStage(client);
  const [reference, setReference] = useState("");

  if (!session || !client) return null;

  const { staged } = stage;
  const canSearch = reference.trim().length > 0 && !stage.busy;
  const liveView = describeLive(live.payload, live.connected);

  const confirmDisconnect = () =>
    Alert.alert(
      "Desconectar de Lumen",
      "Para volver a conectar necesitará el código de seis dígitos.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Desconectar",
          style: "destructive",
          onPress: () => void forget(),
        },
      ],
    );

  return (
    <Screen>
      <View className="flex-row items-end justify-between px-5 pb-3 pt-2">
        <View className="flex-1 gap-0.5">
          <Text className="font-serif-medium text-3xl text-foreground">
            Lumen
          </Text>
          <Text className="font-sans text-sm text-muted-foreground">
            {session.origin.replace("http://", "")}
          </Text>
        </View>
        <View className="w-36">
          <Button
            label="Desconectar"
            variant="ghost"
            onPress={confirmDisconnect}
          />
        </View>
      </View>

      <ScrollView
        contentContainerClassName="gap-4 px-5 pb-4 pt-2"
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <View className="flex-row items-center justify-between">
            <Text className="font-sans-semibold text-lg text-foreground">
              En el proyector
            </Text>
            <View className="flex-row items-center gap-2">
              <View
                className={`h-2 w-2 rounded-full ${live.connected ? "bg-primary" : "bg-destructive"}`}
              />
              <Text
                className={`font-sans-medium text-sm ${live.connected ? "text-primary" : "text-destructive"}`}
              >
                {live.connected ? "En vivo" : "Sin conexión"}
              </Text>
            </View>
          </View>

          <View className="gap-2">
            {liveView.title ? (
              <Text
                accessibilityLiveRegion="polite"
                className={
                  liveView.body
                    ? "font-sans-medium text-sm text-muted-foreground"
                    : "font-serif text-xl text-foreground"
                }
              >
                {liveView.title}
              </Text>
            ) : null}
            {liveView.body ? (
              <Text
                accessibilityLiveRegion="polite"
                className="font-serif text-xl leading-8 text-foreground"
              >
                {liveView.body}
              </Text>
            ) : null}
          </View>

          {live.connected ? null : (
            <Text className="font-sans text-sm text-muted-foreground">
              Buscando Lumen en sus direcciones guardadas. Si cambió de red, use
              Tailscale o escanee el QR de nuevo.
            </Text>
          )}

          <Button
            label="Pantalla negra"
            disabled={stage.busy}
            onPress={() => void stage.blankProjector()}
          />
        </Card>

        <Card>
          <Text className="font-sans-semibold text-lg text-foreground">
            Buscar pasaje
          </Text>

          {stage.versions.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {stage.versions.map((version) => {
                  const selected = version.id === stage.versionId;
                  return (
                    <Pressable
                      key={version.id}
                      accessibilityRole="button"
                      accessibilityLabel={version.name}
                      accessibilityState={{ selected }}
                      onPress={() => stage.selectVersion(version.id)}
                      className={`min-h-11 items-center justify-center rounded-full border px-5 ${selected ? "border-primary bg-primary" : "border-border bg-secondary"}`}
                    >
                      <Text
                        className={`font-sans-semibold text-base ${selected ? "text-primary-foreground" : "text-foreground"}`}
                      >
                        {version.abbr}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          ) : null}

          <Field
            label="Pasaje"
            value={reference}
            onChangeText={setReference}
            placeholder="Juan 3:16"
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => {
              if (canSearch) void stage.stageReference(reference);
            }}
          />
          <Button
            label={stage.busy ? "Buscando…" : "Buscar"}
            disabled={!canSearch || !stage.ready}
            onPress={() => void stage.stageReference(reference)}
          />

          {staged ? <StagedPreview staged={staged} /> : null}
          {stage.error ? <ErrorText>{stage.error}</ErrorText> : null}
        </Card>
      </ScrollView>

      <View className="gap-3 border-t border-border bg-background px-5 pb-3 pt-3">
        <View className="flex-row gap-3">
          <Button
            label="Anterior"
            disabled={!staged || stage.busy}
            onPress={() => void stage.stepBy(-1)}
          />
          <Button
            label="Siguiente"
            disabled={!staged || stage.busy}
            onPress={() => void stage.stepBy(1)}
          />
        </View>
        <Button
          label={staged ? `Proyectar ${staged.referenceLabel}` : "Proyectar"}
          variant="primary"
          disabled={!staged || stage.busy}
          onPress={() => void stage.projectStaged()}
        />
      </View>
    </Screen>
  );
}
