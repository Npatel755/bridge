// Loads Bridge's two typefaces. Render nothing (or the splash screen) until this returns true.
import { useFonts } from "expo-font";
import { Literata_400Regular } from "@expo-google-fonts/literata/400Regular";
import { Literata_500Medium } from "@expo-google-fonts/literata/500Medium";
import { InterTight_400Regular } from "@expo-google-fonts/inter-tight/400Regular";
import { InterTight_500Medium } from "@expo-google-fonts/inter-tight/500Medium";

export function useBridgeFonts(): boolean {
  const [loaded, error] = useFonts({
    Literata_400Regular,
    Literata_500Medium,
    InterTight_400Regular,
    InterTight_500Medium,
  });
  if (error) throw error;
  return loaded;
}
