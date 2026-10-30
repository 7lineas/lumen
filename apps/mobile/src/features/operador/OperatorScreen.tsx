import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { ProjectorPayload } from "@shared/types";
import { Button, Card, ErrorText, Field, Screen } from "@/components/design";
import { useLumenSession } from "@/providers/session-provider";
import { useBibleStage, type StagedVerse } from "./use-bible-stage";
import { useLiveProjector } from "./use-live-projector";

function describeLive(
  payload: ProjectorPayload | null,
  connected: boolean,
): string {
  if (!payload) {
    return connected ? "Nada proyectado todavía." : "Conectando con Lumen…";
  }
  switch (payload.mode) {
    case "blank":
      return "Pantalla negra";
    case "verse":
      return [
        payload.referenceLabel,
        payload.blocks.map((block) => block.text).join(" "),
      ]
        .filter(Boolean)
        .join("\n");
    case "logo":
      return "Logo de la iglesia";
    case "slides":
      return "Diapositiva";
    case "video":
      return "Video";
    case "countdown":
      return "Cuenta regresiva";
    default:
      return payload.mode;
  }
}

function StagedPreview({ staged }: { staged: StagedVerse }) {
  return (
    <View className="gap-2 rounded-lg bg-background p-3">
      <Text className="text-sm font-semibold text-primary">
        {staged.referenceLabel}
      </Text>
      {staged.blocks.map((block, index) => (
        <Text key={index} className="text-base leading-6 text-foreground">
          {block.label ? `${block.label} · ` : ""}
          {block.text}
        </Text>
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

  return (
    <Screen>
      <View className="flex-row items-center justify-between px-5 pb-3 pt-2">
        <View className="flex-1 gap-0.5">
          <Text className="text-2xl font-bold text-foreground">Lumen</Text>
          <Text className="text-xs text-muted-foreground">
            {session.origin.replace("http://", "")}
          </Text>
        </View>
        <View className="w-32">
          <Button
            label="Desconectar"
            variant="ghost"
            onPress={() => void forget()}
          />
        </View>
      </View>

      <ScrollView
        contentContainerClassName="gap-4 px-5 pb-10"
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              En el proyector
            </Text>
            <Text
              className={`text-xs font-semibold ${live.connected ? "text-primary" : "text-destructive"}`}
            >
              {live.connected ? "En vivo" : "Sin conexión"}
            </Text>
          </View>
          <Text className="text-base leading-6 text-foreground">
            {describeLive(live.payload, live.connected)}
          </Text>
        </Card>

        <Card>
          <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Versículo
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
                      accessibilityState={{ selected }}
                      onPress={() => stage.selectVersion(version.id)}
                      className={`rounded-full border px-3 py-1.5 ${selected ? "border-primary bg-primary" : "border-border bg-secondary"}`}
                    >
                      <Text
                        className={`text-sm font-semibold ${selected ? "text-primary-foreground" : "text-foreground"}`}
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
            label="Buscar"
            disabled={!canSearch || !stage.ready}
            onPress={() => void stage.stageReference(reference)}
          />

          {staged ? <StagedPreview staged={staged} /> : null}
          {stage.error ? <ErrorText>{stage.error}</ErrorText> : null}
        </Card>

        <Card>
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
            label="Proyectar"
            variant="primary"
            disabled={!staged || stage.busy}
            onPress={() => void stage.projectStaged()}
          />
          <Button
            label="Pantalla negra"
            disabled={stage.busy}
            onPress={() => void stage.blankProjector()}
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}
