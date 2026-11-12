"use client";

import type { ChatBotCard } from "@/lib/chat/bot-card";
import { cn } from "@/lib/utils";

export function BotMessageCard({
  card,
  className,
}: {
  card: ChatBotCard;
  className?: string;
}) {
  return (
    <div
      className={cn("ember-bot-card", className)}
      style={card.color ? { borderInlineStartColor: card.color } : undefined}
    >
      {card.title ? <p className="ember-bot-card__title">{card.title}</p> : null}
      {card.text ? <p className="mt-1 whitespace-pre-wrap break-words text-sm opacity-95">{card.text}</p> : null}
      {card.fields.length > 0 ? (
        <div className="ember-bot-card__fields">
          {card.fields.map((field) => (
            <div key={`${field.label}:${field.value}`}>
              <span className="ember-bot-card__field-label">{field.label}</span>
              <span className="ember-bot-card__field-value">{field.value}</span>
            </div>
          ))}
        </div>
      ) : null}
      {card.footer ? <p className="ember-bot-card__footer">{card.footer}</p> : null}
    </div>
  );
}
