from __future__ import annotations
import json
from pathlib import Path
import sys
import tkinter as tk


def all_widgets(root):
    yield root
    for child in root.winfo_children():
        yield from all_widgets(child)


def screenshot(path):
    from PIL import ImageGrab
    ImageGrab.grab().save(path)


def find_button(root, label):
    for widget in all_widgets(root):
        if isinstance(widget, (tk.Button,)) or widget.winfo_class() == 'TButton':
            if widget.cget('text') == label:
                return widget
    raise AssertionError(f'Button not found: {label}')


def verify_window(window, screen_w, screen_h, label):
    window.update_idletasks()
    width, height = window.winfo_width(), window.winfo_height()
    x, y = window.winfo_rootx(), window.winfo_rooty()
    if width > screen_w or height > screen_h:
        raise AssertionError((label, 'window size', (width, height), (screen_w, screen_h)))
    if x < -5 or y < -5 or x + width > screen_w + 5 or y + height > screen_h + 5:
        raise AssertionError((label, 'outside screen', (x, y, width, height), (screen_w, screen_h)))
    canvases = [w for w in all_widgets(window) if isinstance(w, tk.Canvas)]
    info = {'name': label,'window':[x,y,width,height], 'canvases':[]}
    for canvas in canvases:
        canvas.update_idletasks()
        region = canvas.cget('scrollregion')
        content = [float(i) for i in region.split()] if region else []
        scroll = list(canvas.yview())
        info['canvases'].append({'viewport':[canvas.winfo_width(),canvas.winfo_height()], 'scrollregion':content, 'yview':scroll})
        if content and len(content)==4 and content[3] > canvas.winfo_height()+12:
            canvas.yview_moveto(1.0)
            window.update_idletasks()
            if canvas.yview()[1] < .98:
                raise AssertionError((label,'bottom cannot be scrolled into view', canvas.yview()))
            canvas.yview_moveto(0)
    return info


def drive(root):
    root.update_idletasks()
    screen_w = root.winfo_screenwidth()
    screen_h = root.winfo_screenheight()
    output = [verify_window(root, screen_w, screen_h, 'Main editor')]
    for label in ('Speak', 'Export audio', 'Video', 'Batch'):
        button = find_button(root, label)
        by = button.winfo_rooty()
        if by < root.winfo_rooty() or by + button.winfo_height() > root.winfo_rooty()+root.winfo_height():
            raise AssertionError((label, 'Main action hidden below window'))
    from openvoice import gui
    gui.fetch_catalog=lambda: []
    for label in ('Text tools', 'Find / Replace', 'Combine Chapters', 'Character Voices', 'Text + Images → Video', 'Download Piper voices by language'):
        button = find_button(root,label)
        button.invoke()
        root.update_idletasks()
        windows=[w for w in root.winfo_children() if isinstance(w, tk.Toplevel)]
        if not windows:
            raise AssertionError(f'No popup for {label}')
        window=windows[-1]
        output.append(verify_window(window,screen_w,screen_h,label))
        footer = {'Combine Chapters': '▶  One-click export all books', 'Character Voices': 'Export Video', 'Text + Images → Video': 'Export audiobook video…', 'Download Piper voices by language': 'Download Entire Catalog', 'Text tools': 'Apply to editor'}.get(label)
        if footer:
            canvases=[w for w in all_widgets(window) if isinstance(w, tk.Canvas)]
            if canvases:
                canvases[0].yview_moveto(1.0)
                root.update_idletasks()
            button=find_button(window,footer)
            if not (window.winfo_rooty() <= button.winfo_rooty() and button.winfo_rooty() + button.winfo_height() <= window.winfo_rooty()+window.winfo_height()+2):
                raise AssertionError((label,footer,'cannot reach bottom action',button.winfo_rooty()))
        window.destroy()
        root.update_idletasks()
    root.attributes('-fullscreen',True)
    root.update_idletasks()
    output.append(verify_window(root, screen_w, screen_h, 'Fullscreen'))
    root.attributes('-fullscreen',False)
    root.update_idletasks()
    print(json.dumps(output,indent=2))
    root.destroy()


if __name__ == '__main__':
    tk.Tk.mainloop=lambda root, n=0: drive(root)
    from openvoice.gui import main
    sys.exit(main())
