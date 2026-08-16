import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, ScrollView, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";

export default function ElderLogin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signInElder, signUpElder } = useAuth();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // signup steps: name -> phone -> pin ; login steps: phone -> pin
  const [step, setStep] = useState<"name" | "phone" | "pin">(mode === "signup" ? "name" : "phone");

  const press = (d: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setError("");
    if (step === "pin") {
      if (pin.length < 4) setPin(pin + d);
    } else {
      setPhone(phone + d);
    }
  };
  const back = () => {
    if (step === "pin") setPin(pin.slice(0, -1));
    else setPhone(phone.slice(0, -1));
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      if (mode === "login") await signInElder(phone, pin);
      else await signUpElder(name.trim(), phone, pin);
    } catch (e: any) {
      setError(e.message || "Please try again");
      setPin("");
      setStep("pin");
      setBusy(false);
    }
  };

  const switchMode = () => {
    const next = mode === "login" ? "signup" : "login";
    setMode(next);
    setStep(next === "signup" ? "name" : "phone");
    setError(""); setPin(""); setPhone(""); setName("");
  };

  // Name step (signup only) uses a simple text input
  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]} testID="elder-login">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn} testID="elder-back">
          <Ionicons name="chevron-back" size={30} color={theme.colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{mode === "login" ? "Welcome back" : "Create account"}</Text>
        <View style={{ width: 44 }} />
      </View>

      {step === "name" ? (
        <ScrollView contentContainerStyle={styles.nameWrap} keyboardShouldPersistTaps="handled">
          <Text style={styles.bigLabel}>What is your name?</Text>
          <TextField value={name} onChangeText={setName} placeholder="e.g. Kamala" testID="elder-name-input" />
          <Pressable
            style={[styles.primaryBtn, !name.trim() && styles.btnDisabled]}
            disabled={!name.trim()}
            onPress={() => setStep("phone")}
            testID="elder-name-next"
          >
            <Text style={styles.primaryBtnText}>Continue</Text>
          </Pressable>
          <Pressable onPress={switchMode} style={styles.switchLink}>
            <Text style={styles.switchText}>Already have an account? <Text style={styles.switchBold}>Log in</Text></Text>
          </Pressable>
        </ScrollView>
      ) : (
        <View style={styles.padArea}>
          <Text style={styles.bigLabel}>
            {step === "phone" ? "Enter your phone number" : "Enter your 4-digit PIN"}
          </Text>

          {step === "phone" ? (
            <Text style={styles.phoneDisplay} testID="phone-display">{phone || "\u00A0"}</Text>
          ) : (
            <View style={styles.pinDots}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={[styles.pinDot, i < pin.length && styles.pinDotFilled]} />
              ))}
            </View>
          )}

          {error ? <Text style={styles.error} testID="elder-error">{error}</Text> : <View style={{ height: 24 }} />}

          <Keypad onPress={press} onBack={back} />

          <View style={styles.actionRow}>
            {step === "pin" && (
              <Pressable onPress={() => { setStep("phone"); setPin(""); }} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Back</Text>
              </Pressable>
            )}
            <Pressable
              style={[
                styles.primaryBtn,
                { flex: 1 },
                ((step === "phone" && phone.length < 7) || (step === "pin" && pin.length < 4) || busy) && styles.btnDisabled,
              ]}
              disabled={(step === "phone" && phone.length < 7) || (step === "pin" && pin.length < 4) || busy}
              onPress={() => (step === "phone" ? setStep("pin") : submit())}
              testID="elder-submit"
            >
              <Text style={styles.primaryBtnText}>
                {busy ? "Please wait..." : step === "phone" ? "Continue" : mode === "login" ? "Log in" : "Create account"}
              </Text>
            </Pressable>
          </View>

          {step === "phone" && (
            <Pressable onPress={switchMode} style={styles.switchLink}>
              <Text style={styles.switchText}>
                {mode === "login" ? "New here? " : "Have an account? "}
                <Text style={styles.switchBold}>{mode === "login" ? "Create account" : "Log in"}</Text>
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function Keypad({ onPress, onBack }: { onPress: (d: string) => void; onBack: () => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];
  return (
    <View style={styles.keypad}>
      {keys.map((k, i) => {
        if (k === "") return <View key={i} style={styles.key} />;
        if (k === "back")
          return (
            <Pressable key={i} style={styles.key} onPress={onBack} testID="key-back">
              <Ionicons name="backspace-outline" size={34} color={theme.colors.onSurface} />
            </Pressable>
          );
        return (
          <Pressable key={i} style={styles.key} onPress={() => onPress(k)} testID={`key-${k}`}>
            <Text style={styles.keyText}>{k}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TextField(props: any) {
  return (
    <TextInput
      {...props}
      style={styles.textField}
      placeholderTextColor={theme.colors.muted}
      autoFocus
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface, paddingHorizontal: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontWeight: "800", color: theme.colors.onSurface },
  bigLabel: { fontSize: 24, fontWeight: "700", color: theme.colors.onSurface, textAlign: "center", marginTop: 12 },
  nameWrap: { gap: 20, paddingTop: 40 },
  textField: {
    fontSize: 24, fontWeight: "600", color: theme.colors.onSurface,
    backgroundColor: theme.colors.surfaceSecondary, borderRadius: 18,
    borderWidth: 2, borderColor: theme.colors.border, paddingHorizontal: 20, paddingVertical: 18,
  },
  padArea: { flex: 1 },
  phoneDisplay: { fontSize: 34, fontWeight: "800", color: theme.colors.onSurface, textAlign: "center", marginTop: 20, letterSpacing: 2, minHeight: 44 },
  pinDots: { flexDirection: "row", justifyContent: "center", gap: 20, marginTop: 28 },
  pinDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: theme.colors.borderStrong },
  pinDotFilled: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  error: { color: theme.colors.error, fontSize: 16, fontWeight: "600", textAlign: "center", marginTop: 12, minHeight: 24 },
  keypad: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 12 },
  key: {
    width: "31%", aspectRatio: 1.7, alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors.surfaceSecondary, borderRadius: 18, marginBottom: 12,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  keyText: { fontSize: 34, fontWeight: "700", color: theme.colors.onSurface },
  actionRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  primaryBtn: { backgroundColor: theme.colors.brand, borderRadius: 999, paddingVertical: 20, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontSize: 20, fontWeight: "800" },
  secondaryBtn: { paddingHorizontal: 24, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceTertiary },
  secondaryBtnText: { color: theme.colors.onSurface, fontSize: 18, fontWeight: "700" },
  btnDisabled: { opacity: 0.4 },
  switchLink: { alignItems: "center", marginTop: 18 },
  switchText: { fontSize: 16, color: theme.colors.muted },
  switchBold: { color: theme.colors.brand, fontWeight: "800" },
});
