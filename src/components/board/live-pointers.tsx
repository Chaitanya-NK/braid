"use client";

import type { HocuspocusProvider } from "@hocuspocus/provider";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Input } from "@/components/ui/input";
import { setPresence, usePeerPointers } from "./use-board";

/**
 * Tracks my pointer over the board and draws everyone else's, Figma-style.
 * Press "/" to type a short message that floats next to your pointer.
 *
 * Positions are in the board's scrollable content coordinates, so pointers
 * line up even when people have scrolled to different places.
 */
export function LivePointers({
  provider,
  surfaceRef,
  me,
}: {
  provider: HocuspocusProvider;
  surfaceRef: RefObject<HTMLDivElement | null>;
  me: { name: string; color: string };
}) {
  const peers = usePeerPointers(provider);
  const [myPointer, setMyPointer] = useState<{ x: number; y: number } | null>(null);
  const [chat, setChat] = useState<string | null>(null);
  const frame = useRef<number | null>(null);
  const clearTimer = useRef<number | null>(null);

  // Broadcast my pointer, at most once per animation frame.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const toLocal = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      return { x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) };
    };
    const onMove = (e: PointerEvent) => {
      const point = toLocal(e);
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        setPresence(provider, { pointer: point });
        setMyPointer(point);
      });
    };
    const onLeave = () => {
      setPresence(provider, { pointer: null });
      setMyPointer(null);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (frame.current) cancelAnimationFrame(frame.current);
      setPresence(provider, { pointer: null, chat: null });
    };
  }, [provider, surfaceRef]);

  // "/" opens cursor chat, unless you're typing somewhere already.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || chat !== null) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      if (clearTimer.current) clearTimeout(clearTimer.current);
      setChat("");
      setPresence(provider, { chat: "" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chat, provider]);

  function updateChat(text: string) {
    setChat(text);
    setPresence(provider, { chat: text });
  }

  function closeChat(afterMs = 0) {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    const close = () => {
      setChat(null);
      setPresence(provider, { chat: null });
    };
    if (afterMs) {
      setChat(null); // hide my input now; others keep seeing the message briefly
      clearTimer.current = window.setTimeout(() => setPresence(provider, { chat: null }), afterMs);
    } else close();
  }

  return (
    <div aria-hidden={chat === null} className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {peers.map((p) => (
        <div
          key={p.clientId}
          className="absolute top-0 left-0 flex items-start transition-transform duration-75 ease-linear"
          style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M2 2 L16 8 L9 10 L7 16 Z" fill={p.color} stroke="#fff" strokeWidth="1.2" />
          </svg>
          <span
            className="mt-3.5 max-w-60 rounded-lg rounded-tl-sm px-2 py-1 text-xs font-medium break-words text-white shadow-sm"
            style={{ background: p.color }}
          >
            {p.chat ? (
              <>
                <span className="block text-[10px] opacity-80">{p.name.split(" ")[0]}</span>
                <span className="text-[13px]">{p.chat}</span>
              </>
            ) : (
              p.name.split(" ")[0]
            )}
          </span>
        </div>
      ))}

      {chat !== null && myPointer && (
        <div
          className="pointer-events-auto absolute top-0 left-0"
          style={{ transform: `translate(${myPointer.x + 16}px, ${myPointer.y + 14}px)` }}
        >
          <label htmlFor="cursor-chat" className="sr-only">
            Message shown next to your pointer
          </label>
          <Input
            id="cursor-chat"
            autoFocus
            value={chat}
            maxLength={80}
            placeholder="Say something…"
            onChange={(e) => updateChat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeChat();
              if (e.key === "Enter") closeChat(chat.trim() ? 4000 : 0);
            }}
            onBlur={() => closeChat(chat.trim() ? 4000 : 0)}
            className="h-8 w-56 rounded-lg rounded-tl-sm border-transparent px-2.5 text-[13px] text-white shadow-md placeholder:text-white/70 focus-visible:border-transparent focus-visible:ring-white/40"
            style={{ background: me.color }}
          />
        </div>
      )}
    </div>
  );
}
