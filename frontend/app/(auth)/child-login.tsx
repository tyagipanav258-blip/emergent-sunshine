import { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, TextInput, Platform } from "react-native";
import { AppText } from "@/src/components/AppText";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";

export default function ChildLogin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signInChild, signUpChild } = useAuth();

  // An invite link carries the family code, so nobody has to read six
  // characters down a phone line.
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [mode, setMode] = useState<"login" | "signup">(code ? "signup" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [familyCode, setFamilyCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (code) {
      setFamilyCode(code.toUpperCase());
      setMode("signup");
    }
  }, [code]);

  const submit = async () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setBusy(true);
    setError("");
    try {
      if (mode === "login") await signInChild(email.trim(), password);
      else await signUpChild(name.trim(), email.trim(), password, familyCode.trim().toUpperCase());
    } catch (e: any) {
      setError(e.message || "Please try again");
      setBusy(false);
    }
  };

  const canSubmit =
    mode === "login"
      ? email.trim() && password.length >= 1
      : name.trim() && email.trim() && password.length >= 6 && familyCode.trim().length >= 4;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]} testID="child-login">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn} testID="child-back">
          <Ionicons name="chevron-back" size={30} color={theme.colors.onSurface} />
        </Pressable>
        <AppText style={styles.headerTitle}>Family member</AppText>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" bottomOffset={20}>
        <View style={styles.iconWrap}>
          <Ionicons name="people" size={40} color={theme.colors.brand} />
        </View>
        <AppText style={styles.title}>{mode === "login" ? "Welcome back" : "Create your account"}</AppText>
        <AppText style={styles.subtitle}>
          {mode === "login" ? "Log in to care for your parent" : "Enter your parent's family code to connect"}
        </AppText>

        {mode === "signup" && (
          <Field label="Your name" value={name} onChangeText={setName} placeholder="e.g. Priya" testID="child-name" />
        )}
        <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@email.com" keyboardType="email-address" autoCapitalize="none" testID="child-email" />
        <Field label="Password" value={password} onChangeText={setPassword} placeholder={mode === "signup" ? "At least 6 characters" : "Your password"} secureTextEntry testID="child-password" />
        {mode === "signup" && (
          <Field label="Family code" value={familyCode} onChangeText={(t: string) => setFamilyCode(t.toUpperCase())} placeholder="From your parent's profile" autoCapitalize="characters" testID="child-family-code" />
        )}

        {error ? <AppText style={styles.error} testID="child-error" accessibilityLiveRegion="assertive" accessibilityRole="alert">{error}</AppText> : null}

        <Pressable
          style={[styles.primaryBtn, (!canSubmit || busy) && styles.btnDisabled]}
          disabled={!canSubmit || busy}
          onPress={submit}
          testID="child-submit"
          accessibilityRole="button"
          accessibilityLabel={mode === "login" ? "Log in" : "Create account"}
        >
          <AppText style={styles.primaryBtnText}>{busy ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}</AppText>
        </Pressable>

        <Pressable onPress={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }} style={styles.switchLink} testID="child-switch-mode">
          <AppText style={styles.switchText}>
            {mode === "login" ? "New here? " : "Have an account? "}
            <AppText style={styles.switchBold}>{mode === "login" ? "Create account" : "Log in"}</AppText>
          </AppText>
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

function Field({ label, testID, ...props }: any) {
  return (
    <View style={styles.field}>
      <AppText style={styles.fieldLabel}>{label}</AppText>
      <TextInput style={styles.input} placeholderTextColor={theme.colors.muted} testID={testID} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface, paddingHorizontal: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontWeight: "800", color: theme.colors.onSurface },
  form: { paddingTop: 24, paddingBottom: 40, gap: 16 },
  iconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.colors.brandLight, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  title: { fontSize: 26, fontWeight: "800", color: theme.colors.onSurface, textAlign: "center" },
  subtitle: { fontSize: 16, color: theme.colors.muted, textAlign: "center", marginTop: -6, marginBottom: 8, lineHeight: 22 },
  field: { gap: 8 },
  fieldLabel: { fontSize: 16, fontWeight: "700", color: theme.colors.onSurface },
  input: {
    fontSize: 18, color: theme.colors.onSurface, backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 16, borderWidth: 2, borderColor: theme.colors.border, paddingHorizontal: 18, paddingVertical: 16,
  },
  error: { color: theme.colors.error, fontSize: 15, fontWeight: "600", textAlign: "center" },
  primaryBtn: { backgroundColor: theme.colors.brand, borderRadius: 999, paddingVertical: 18, alignItems: "center", marginTop: 8 },
  primaryBtnText: { color: "#fff", fontSize: 19, fontWeight: "800" },
  btnDisabled: { opacity: 0.4 },
  switchLink: { alignItems: "center", marginTop: 6 },
  switchText: { fontSize: 16, color: theme.colors.muted },
  switchBold: { color: theme.colors.brand, fontWeight: "800" },
});
