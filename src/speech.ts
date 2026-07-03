export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string, lang: "en" | "ja"): void {
  if (!isSpeechSynthesisSupported() || text.trim() === "") return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === "en" ? "en-US" : "ja-JP";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
