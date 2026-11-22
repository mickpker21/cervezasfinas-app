import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/supabaseClient';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { X } from 'lucide-react';

export default function GlobalAnnouncement() {
  const [announcement, setAnnouncement] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fetchAnnouncement = async () => {
      try {
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from('announcements')
          .select('*')
          .eq('is_active', true)
          .lte('start_date', now)
          .gte('end_date', now)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          if (error.code !== 'PGRST116') { // No rows found is fine
            console.error('[GlobalAnnouncement] Error fetching:', error);
          }
          return;
        }

        if (data) {
          // Check if already seen
          const seenToken = `announcement_seen_${data.id}`;
          const hasSeen = localStorage.getItem(seenToken);

          if (!hasSeen) {
            setAnnouncement(data);
            setOpen(true);
          }
        }
      } catch (err) {
        console.error('[GlobalAnnouncement] Unhandled error:', err);
      }
    };

    fetchAnnouncement();
  }, []);

  const handleClose = () => {
    if (announcement) {
      localStorage.setItem(`announcement_seen_${announcement.id}`, 'true');
    }
    setOpen(false);
  };

  if (!announcement) return null;

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) handleClose(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-transparent border-0 shadow-2xl">
        <VisuallyHidden><DialogTitle>Anuncio Corporativo</DialogTitle></VisuallyHidden>

        <div className="relative group">
          <button 
            onClick={handleClose}
            className="absolute top-2 right-2 z-50 bg-black/50 hover:bg-black/80 text-white rounded-full p-2 transition-colors duration-200 backdrop-blur-sm"
          >
            <X className="w-5 h-5" />
          </button>
          
          <img 
            src={announcement.image_url} 
            alt={announcement.title || "Anuncio"} 
            className="w-full h-auto max-h-[85vh] object-contain rounded-xl bg-slate-900"
          />
          
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent">
            {announcement.title && (
              <h3 className="text-white text-lg font-bold mb-2">{announcement.title}</h3>
            )}
            <Button 
              onClick={handleClose} 
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg"
            >
              Enterado
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
