import { cn } from "@/lib/utils.js";

export function Tabs({ tabs, value, onValueChange }) {
  return (
    <div className="tabs-shell">
      <div className="tabs-list" role="tablist" aria-label="Research result sections">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={value === tab.value}
            className={cn("tabs-trigger", value === tab.value && "tabs-trigger-active")}
            onClick={() => onValueChange(tab.value)}
          >
            <span>{tab.label}</span>
            <span className="tabs-count">{tab.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
