import { Redirect } from "expo-router";
import { useConnection } from "../stores/connectionStore";

export default function Index() {
  const { configured } = useConnection();
  if (configured) return <Redirect href="/(tabs)/home" />;
  return <Redirect href="/onboarding" />;
}
