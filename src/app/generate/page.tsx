import { Suspense } from "react";
import { LiveAgent } from "./LiveAgent";

export const metadata = { title: "Investigating… · OAuth Ready" };

export default function GeneratePage() {
  return (
    <main className="grid-bg min-h-[80vh]">
      <Suspense>
        <LiveAgent />
      </Suspense>
    </main>
  );
}
