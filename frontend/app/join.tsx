import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Landing point for invite links (`sunshine://join?code=ABC123`).
 * Hands the family code straight to child signup so the code never has to be
 * read out loud or typed by hand.
 */
export default function Join() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  return <Redirect href={{ pathname: "/(auth)/child-login", params: code ? { code } : {} }} />;
}
