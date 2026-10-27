import { redirect } from "next/navigation";

// Adding papers happens in a window on top of the list now; old links land there.
export default function NewPaperPage() {
  redirect("/?add=1");
}
