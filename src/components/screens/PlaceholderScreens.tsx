import { Compass, Users, Store, Bot } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface PlaceholderScreenProps {
  icon: LucideIcon;
  title: string;
  description: string;
  items: { title: string; meta: string }[];
}

function PlaceholderScreen({ icon: Icon, title, description, items }: PlaceholderScreenProps) {
  return (
    <div className="w-full h-full overflow-y-auto bg-dusk-900 p-8">
      <div className="max-w-3xl">
        <div className="flex items-center gap-3 mb-1">
          {/* Muted, not accent: section icons aren't a trust context, and amber on four
              screen headers would stop the accent reading as sparing. */}
          <Icon className="w-6 h-6 text-dusk-300" />
          <h1 className="font-display text-2xl font-semibold text-dusk-50">{title}</h1>
        </div>
        <p className="text-dusk-300 mb-6">{description}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map((item) => (
            <div
              key={item.title}
              className="rounded-lg bg-dusk-950 border border-dusk-800 p-4 hover:border-dusk-700 transition-colors"
            >
              <div className="h-24 rounded-md bg-dusk-900 border border-dusk-800 mb-3" />
              <h3 className="text-sm font-semibold text-dusk-100">{item.title}</h3>
              {/* dusk-400, the text floor. dusk-500/600 fail AA. */}
              <p className="text-xs text-dusk-400 mt-0.5">{item.meta}</p>
            </div>
          ))}
        </div>

        <p className="mt-8 text-xs text-dusk-400">
          Placeholder content — this screen isn't built yet.
        </p>
      </div>
    </div>
  );
}

export function ExploreScreen() {
  return (
    <PlaceholderScreen
      icon={Compass}
      title="Explore"
      description="Discover verified places and people near you."
      items={[
        { title: '4th Ave Coffee', meta: 'Parkhurst · 400 m away' },
        { title: 'Neighbourgoods Market', meta: 'Braamfontein · 2.1 km away' },
        { title: 'Rooftop at 44 Stanley', meta: 'Milpark · 3.8 km away' },
        { title: 'Zoo Lake Park', meta: 'Parkview · 4.2 km away' },
      ]}
    />
  );
}

export function MeetupsScreen() {
  return (
    <PlaceholderScreen
      icon={Users}
      title="Meetups"
      description="Turn a conversation in the world into meeting up in real life."
      items={[
        { title: 'Saturday Coffee Run', meta: '6 going · Sat 09:00' },
        { title: 'Braamfontein Rooftop', meta: '12 going · Sat 18:30' },
        { title: 'Sunday Park Walk', meta: '3 going · Sun 07:00' },
        { title: 'Founders Breakfast', meta: '9 going · Tue 08:00' },
      ]}
    />
  );
}

export function MarketScreen() {
  return (
    <PlaceholderScreen
      icon={Store}
      title="Market"
      description="Storefronts from verified sellers. Pi payments arrive in a later phase."
      items={[
        { title: 'Retro Sneakers', meta: '25 Pi · Sipho B.' },
        { title: 'Handmade Ceramics', meta: '40 Pi · Thandi M.' },
        { title: 'Vintage Denim Jacket', meta: '60 Pi · Lerato K.' },
        { title: 'Local Roast — 1kg', meta: '15 Pi · 4th Ave Coffee' },
      ]}
    />
  );
}

export function AgentScreen() {
  return (
    <PlaceholderScreen
      icon={Bot}
      title="Agent"
      description="Autonomous avatars that act on your behalf while you're away."
      items={[
        { title: 'Basic — Scripted', meta: 'Not configured' },
        { title: 'Standard — LLM', meta: 'Not configured' },
        { title: 'Advanced — Adaptive', meta: 'Not configured' },
        { title: 'Activity Log', meta: 'No activity yet' },
      ]}
    />
  );
}
