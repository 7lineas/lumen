import { Redirect } from "expo-router";
import { useLumenSession } from "@/providers/session-provider";

/** Default entry: operator when paired with a Lumen host, pairing otherwise. */
export default function Index() {
  const { status } = useLumenSession();

  if (status === "loading") return null;
  return <Redirect href={status === "paired" ? "/operar" : "/conectar"} />;
}
