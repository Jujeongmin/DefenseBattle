// ============================================================
//  덱 편성 끌어다 놓기 - 카드를 덱 칸으로 끌어 넣고, 칸끼리 바꾸고, 칸 밖으로 끌어 뺀다.
//  끌 수 있는 것: [data-drag] (값 = 유닛/카드 키, 덱 칸이면 data-slot 도 있음)
//  놓는 곳: [data-drop-slot] (덱 칸 번호)
//  살짝 누르고 떼면(끌지 않으면) 평소 클릭으로 처리된다.
// ============================================================

export type DeckDrop = (key: string, fromSlot: number | null, toSlot: number | 'out') => void;

export function enableDeckDrag(root: HTMLElement, onDrop: DeckDrop): void {
  root.querySelectorAll<HTMLElement>('[data-drag]').forEach((el) => {
    el.onpointerdown = (e) => {
      if (e.button > 0) return;
      // 스킬 ?·막는 유닛 아이콘을 누른 것은 말풍선용 - 손가락이 조금 밀려도 끌기로 바뀌어 탭이 먹히지 않게
      if ((e.target as HTMLElement).closest('[data-tip-skill],[data-tip-unit]')) return;
      const key = el.dataset.drag!;
      const fromSlot = el.dataset.slot !== undefined ? Number(el.dataset.slot) : null;
      const x0 = e.clientX, y0 = e.clientY;
      let ghost: HTMLElement | null = null;
      let over: HTMLElement | null = null;
      // 포인터 캡처는 쓰지 않는다: 캡처하면 click 이 카드로 넘어가 카드 안 버튼(?, 넣기, 강화)이 눌리지 않는다.
      // 대신 window 에서 움직임·뗌을 받는다 (손가락이 카드 밖으로 나가도 끌기가 이어짐).

      const slotAt = (x: number, y: number) =>
        (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-drop-slot]') ?? null;
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        if (!ghost) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return;
          // 끌기 시작: 카드 그림을 손가락에 붙인다
          const src = el.querySelector<HTMLElement>('.frame-sprite') ?? el;
          ghost = src.cloneNode(true) as HTMLElement;
          ghost.classList.add('deck-ghost');
          document.body.appendChild(ghost);
          root.classList.add('deck-dragging');
          el.classList.add('drag-src');
        }
        ghost.style.left = `${ev.clientX}px`;
        ghost.style.top = `${ev.clientY}px`;
        const s = slotAt(ev.clientX, ev.clientY);
        if (s !== over) { over?.classList.remove('drop-hover'); s?.classList.add('drop-hover'); over = s; }
      };
      const finish = (ev: PointerEvent | null) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        if (!ghost) return; // 끌지 않았다 → 클릭으로 처리
        ghost.remove();
        over?.classList.remove('drop-hover');
        root.classList.remove('deck-dragging');
        el.classList.remove('drag-src');
        // 끌기 뒤에 따라오는 click 은 무시 (버튼이 눌리지 않게)
        const stop = (c: Event) => { c.stopPropagation(); c.preventDefault(); };
        window.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 50);
        if (!ev) return;
        const s = slotAt(ev.clientX, ev.clientY);
        if (s) onDrop(key, fromSlot, Number(s.dataset.dropSlot));
        else if (fromSlot !== null) onDrop(key, fromSlot, 'out');
      };
      const up = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) finish(ev); };
      const cancel = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) finish(null); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
    };
  });
}
