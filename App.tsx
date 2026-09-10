import React, { Suspense, lazy } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { WithSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import { T } from "./src/ui/theme";

/**
 * The game is always pulled in lazily. On web the Skia backend is CanvasKit, which
 * must finish loading before anything touches the `Skia` object — and a static
 * import of the game would evaluate that module first and hand back an undefined
 * API. Native links Skia in, so there it is only a code-split.
 */
async function loadGame(): Promise<{ default: React.ComponentType<object> }> {
  const m = await import("./src/GameScreen");
  return { default: m.GameScreen as React.ComponentType<object> };
}

const LazyGame = lazy(loadGame);

function Loading() {
  return (
    <View style={styles.loading}>
      <Text style={styles.loadingText}>Ditto Wars</Text>
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      {Platform.OS === "web" ? (
        <WithSkiaWeb
          getComponent={loadGame}
          fallback={<Loading />}
          opts={{ locateFile: (file: string) => `/${file}` }}
        />
      ) : (
        <Suspense fallback={<Loading />}>
          <LazyGame />
        </Suspense>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  // A game is not a document: dragging across it should never leave a blue smear of
  // selected text. Inherited, so every screen gets it without remembering to.
  root: { flex: 1, backgroundColor: T.void, userSelect: "none" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: T.void },
  loadingText: { color: T.mute, fontSize: 15, letterSpacing: 2, textTransform: "uppercase" },
});
