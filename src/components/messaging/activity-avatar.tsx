import { Avatar } from "@/components/ui/primitives";

/** A conversation list avatar with a green dot when the other side is online. */
export function ActivityAvatar({ name, online }: { name: string; online: boolean }) {
  return (
    <span className="relative h-fit shrink-0">
      <Avatar name={name} />
      {online ? (
        <span className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-surface bg-success">
          <span className="sr-only">Online</span>
        </span>
      ) : null}
    </span>
  );
}
