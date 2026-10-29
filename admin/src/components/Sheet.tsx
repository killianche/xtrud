// Шторка снизу — замена системных окон браузера (window.prompt/confirm),
// которые на iPhone серые, без вариантов ответа и с мелким шрифтом (№367).
// На компьютере та же шторка встаёт по центру.
//
// Закрытие: касание по затемнению, Escape, кнопка, свайп вниз по ручке.
// Анимация уезда доигрывается до конца, потом шторка снимается.

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
  labelledBy,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  labelledBy?: string;
}) {
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);

  const close = useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 200);
  }, [closing, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    // Страница под шторкой не прокручивается.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [close]);

  // Свайп вниз по ручке/шапке — закрыть.
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, dy: 0 };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !sheetRef.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    drag.current.dy = dy;
    sheetRef.current.style.transform = `translateY(${dy}px)`;
    sheetRef.current.style.transition = "none";
  };
  const onPointerUp = () => {
    if (!drag.current || !sheetRef.current) return;
    const { dy } = drag.current;
    drag.current = null;
    sheetRef.current.style.transition = "transform 260ms var(--ease-out)";
    if (dy > 90) {
      sheetRef.current.style.transform = "translateY(100%)";
      window.setTimeout(onClose, 220);
    } else {
      sheetRef.current.style.transform = "";
    }
  };

  return (
    <div className={`sheet-root${closing ? " is-closing" : ""}`}>
      <button
        type="button"
        className="sheet-scrim"
        aria-label="Закрыть"
        tabIndex={-1}
        onClick={close}
      />
      <div
        ref={sheetRef}
        className={`sheet${closing ? " is-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        <div
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="sheet-grabber" />
          {title ? (
            <div className="sheet-head">
              <p className="title-2" id={labelledBy}>
                {title}
              </p>
              {subtitle ? (
                <p className="body-md text-mute" style={{ margin: "6px 0 0" }}>
                  {subtitle}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        {children ? <div className="sheet-body">{children}</div> : null}
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </div>
  );
}
