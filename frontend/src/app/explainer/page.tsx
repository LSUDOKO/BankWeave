import type { Metadata } from "next";
import Explainer from "@/components/explainer/Explainer";

export const metadata: Metadata = {
  title: "How BankWeave finds a ring no bank can see · BankWeave",
  description: "A scroll-driven 3D walk through one cross-bank investigation on FalkorDB: bank graphs, the consortium join, algo.wcc, PageRank, echo-proof confidence, the validity cascade and the signed Merkle root.",
};

export default function ExplainerPage() {
  return <Explainer />;
}
