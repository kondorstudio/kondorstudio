import React from "react";
import CreativeCard from "@/components/creatives/creativeCard.jsx";

export default function CreativeGrid({
  creatives,
  clients,
  onSelectCreative,
  onUseInPost,
  onDownloadCreative,
}) {
  const clientNames = React.useMemo(() => {
    const map = {};
    clients.forEach((client) => {
      map[client.id] = client.name;
    });
    return map;
  }, [clients]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {creatives.map((creative) => (
        <CreativeCard
          key={creative.id}
          creative={creative}
          clientName={clientNames[creative.client_id]}
          onSelect={onSelectCreative}
          onUseInPost={onUseInPost}
          onDownload={onDownloadCreative}
        />
      ))}
    </div>
  );
}

CreativeGrid.defaultProps = {
  creatives: [],
  clients: [],
  onSelectCreative: () => {},
  onUseInPost: () => {},
  onDownloadCreative: () => {},
};
