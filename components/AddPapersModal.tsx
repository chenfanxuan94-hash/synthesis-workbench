"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AddPapers from "./AddPapers";

// The "+ Add papers" button and the window it opens on top of the list.
// When the window closes after something was added, the list behind it reloads.
export default function AddPapersModal({ openByDefault = false, stage = "master" }: { openByDefault?: boolean; stage?: "search" | "master" }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    if (openByDefault && ref.current && !ref.current.open) ref.current.showModal();
  }, [openByDefault]);

  function open() {
    setChanged(false);
    ref.current?.showModal();
  }
  function onClose() {
    if (changed) router.refresh();
    if (openByDefault) router.replace(stage === "search" ? "/search" : "/");
  }

  return (
    <>
      <button type="button" className="primary big addbtn" onClick={open}>+ Add papers</button>
      <dialog ref={ref} className="modal" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <div className="modal-body">
          <div className="modal-head">
            <h2>{stage === "search" ? "Add papers to the search list" : "Add papers to the master list"}</h2>
            <button type="button" className="small" onClick={() => ref.current?.close()}>Close</button>
          </div>
          <p className="muted" style={{ margin: "0 0 10px" }}>
            {stage === "search"
              ? "Papers added here join the search list to be screened with the database hits: exports from PsycINFO or Google Scholar, single DOIs, or PDFs."
              : "Papers added here skip screening and go straight to the master list, for papers you already know belong. To screen them first, add them on the Search page instead."}
          </p>
          <AddPapers onAdded={() => setChanged(true)} stage={stage} />
        </div>
      </dialog>
    </>
  );
}
