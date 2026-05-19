"use client";

interface NumericKeypadProps {
  onPress: (key: string) => void;
  onBackspace?: () => void;
  onClear?: () => void;
  className?: string;
}

export default function NumericKeypad({ onPress, onBackspace, onClear, className = "" }: NumericKeypadProps) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "←"];

  return (
    <div className={`keypad ${className}`}>
      {keys.map((key) => (
        <button
          type="button"
          key={key}
          className="keypad-btn"
          onClick={() => {
            if (key === "←") onBackspace?.();
            else onPress(key);
          }}
          aria-label={key === "←" ? "Backspace" : key}
        >
          {key}
        </button>
      ))}
      {onClear && (
        <button type="button" className="keypad-btn keypad-btn-wide" onClick={onClear} aria-label="Clear">
          Clear
        </button>
      )}
    </div>
  );
}
