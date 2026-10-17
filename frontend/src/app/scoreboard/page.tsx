import { redirect } from "next/navigation";

// the scoreboard became the Evaluation page in 2.0
export default function Scoreboard() {
  redirect("/evaluation");
}
