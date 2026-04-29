import rawData from "../data/demo-data.json";
import { JccWorkbench } from "../components/JccWorkbench";
import type { JccData } from "../lib/types";

export default function Page() {
  return <JccWorkbench data={rawData as JccData} />;
}
