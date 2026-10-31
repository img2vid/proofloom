from __future__ import annotations
import copy
import tempfile
from dataclasses import asdict
import queue
import threading
from pathlib import Path
from .documents import read_document
from .engines import RunControl, SpeechSettings, all_engines, get_engine
from .service import JobOptions, render_text, speak_text
from .texttools import TOOLS, transform, text_stats
from .audiofx import process_audio, FORMATS
from .video import VideoOptions, render_video, ASPECTS, HEIGHTS
from .edition import APP_NAME, EDITION, GUTENBERG_ENABLED
from .piper_models import install_voice, voice_directory, discover_voices
from .character_voices import VoiceProject, CharacterProfile, auto_profiles, detect_characters, detect_language, detected_languages, recommend_voices
from .voice_catalog import fetch_catalog, download_selected, catalog_languages, voice_download_size
from .multivoice import render_multivoice, render_multivoice_video
from .project_archive import ProjectData, save_project, load_project
from .voice_design import design_for_profile, STYLE_DESIGNS
from .windowing import fit_window, keep_window_visible, scrollable_area, adaptive_grid
from .ocr_ui import SpellingController, show_ocr_import, show_spelling_settings, show_chapter_review
from .ocr import SCAN_EXTENSIONS
if GUTENBERG_ENABLED:
    from .gutenberg import clean_gutenberg, GutenbergOptions
from .audiobooks import Book, Chapter, BookExportOptions, discover_books, load_manifest, export_books, _split_ebook, _match_cover, _files, DOCUMENTS

def main() -> int:
    try:
        import tkinter as tk
        from tkinter import filedialog, messagebox, ttk, simpledialog
    except ImportError:
        print(f'{APP_NAME} requires Tkinter. On Debian/Ubuntu: sudo apt install python3-tk')
        return 1

    class App:
        BG = '#111827'
        CARD = '#1f2937'
        FIELD = '#0f172a'
        FG = '#e5e7eb'
        MUTED = '#aab4c5'
        ACCENT = '#20c997'

        def __init__(self, root):
            self.root = root
            self.root.title(f'{APP_NAME} — Version 1')
            fit_window(self.root, 1150, 750, 650, 430)
            self.root.configure(bg=self.BG)
            self.events: queue.Queue = queue.Queue()
            self.active = False
            self.control: RunControl | None = None
            self.current_file: Path | None = None
            self.engines = all_engines()
            self.voice_project = VoiceProject()
            self.books = []
            self.book_export_settings = {}
            self.video_images = []
            self.video_audio = None
            self.video_options = {}
            self.project_file = None
            self._project_workspace = None
            self.ocr_settings = {}
            self.ocr_report = {}
            self._ocr_running = False
            self._ocr_cancel = None
            self.active_character_var = tk.StringVar(value='Narrator')
            self.use_character_voices_var = tk.BooleanVar(value=True)
            self._icon = None
            self._set_icon()
            self.engine_var = tk.StringVar(value='auto')
            self.voice_var = tk.StringVar()
            self.model_var = tk.StringVar()
            self.dict_var = tk.StringVar()
            self.ipa_dict_var = tk.StringVar()
            self.rate_var = tk.IntVar(value=0)
            self.pitch_var = tk.IntVar(value=0)
            self.volume_var = tk.IntVar(value=100)
            self.ocr_var = tk.BooleanVar(value=False)
            self.status_var = tk.StringVar(value='Ready · Offline speech')
            self.pause_var = tk.StringVar(value='Pause between sentences')
            self.counters_var = tk.StringVar(value='')
            self.font_size = 12
            self._styles()
            self._layout()
            self.spelling = SpellingController(self.root, self.editor, self.status_var, changed=self.update_stats)
            self._bindings()
            self._menus()
            self.root.after(600, self._watch_display)
            self.editor.bind('<KeyRelease>', lambda _event: self.update_stats())
            self.update_stats()
            self.refresh_voices()
            self.root.after(100, self.poll)
            self.root.protocol('WM_DELETE_WINDOW', self.close)

        def _dialog(self, title, width, height, *, min_width=480, min_height=360, padding=12, scroll=True):
            window = tk.Toplevel(self.root)
            window.title(title)
            fit_window(window, width, height, min_width, min_height)
            window.configure(bg=self.BG)
            self.root.after(650, lambda win=window: self._watch_dialog(win))
            if scroll:
                shell, panel, canvas = scrollable_area(window, padding=padding, background=self.BG)
                shell.pack(fill='both', expand=True)
                return window, panel
            panel = ttk.Frame(window, padding=padding)
            panel.pack(fill='both', expand=True)
            return window, panel

        def _watch_dialog(self, window):
            if not window.winfo_exists():
                return
            keep_window_visible(window)
            self.root.after(800, lambda win=window: self._watch_dialog(win))

        def _watch_display(self):
            if not self.root.winfo_exists():
                return
            keep_window_visible(self.root)
            compact = self.root.winfo_width() < 780 or self.root.winfo_height() < 540
            if compact != getattr(self, '_compact', None):
                self._compact = compact
                if compact:
                    self.secondary_toolbar.pack_forget()
                    self.subtitle.pack_forget()
                else:
                    self.subtitle.pack(anchor='w')
                    self.secondary_toolbar.pack(fill='x')
            self.root.after(800, self._watch_display)

        def _styles(self):
            style = ttk.Style()
            style.theme_use('clam')
            style.configure('TFrame', background=self.BG)
            style.configure('Panel.TFrame', background=self.CARD)
            style.configure('TLabel', background=self.BG, foreground=self.FG, font=('Segoe UI', 10))
            style.configure('Panel.TLabel', background=self.CARD, foreground=self.FG, font=('Segoe UI', 10))
            style.configure('Title.TLabel', background=self.BG, foreground=self.FG, font=('Segoe UI Semibold', 21))
            style.configure('Muted.TLabel', background=self.BG, foreground=self.MUTED, font=('Segoe UI', 10))
            style.configure('PanelTitle.TLabel', background=self.CARD, foreground=self.ACCENT, font=('Segoe UI Semibold', 12))
            style.configure('TButton', padding=(10, 8), font=('Segoe UI', 10), background='#334155', foreground=self.FG, borderwidth=0)
            style.map('TButton', background=[('active', '#45556e'), ('disabled', '#293343')], foreground=[('disabled', '#8190a3')])
            style.configure('Accent.TButton', background=self.ACCENT, foreground='#10231e', padding=(13, 9), font=('Segoe UI Semibold', 10))
            style.map('Accent.TButton', background=[('active', '#57e3bb')])
            style.configure('TCombobox', fieldbackground=self.FIELD, background='#334155', foreground=self.FG, arrowcolor=self.FG)
            style.map('TCombobox', fieldbackground=[('readonly', self.FIELD)], foreground=[('readonly', self.FG)], selectbackground=[('readonly', self.FIELD)], selectforeground=[('readonly', self.FG)])
            style.configure('TEntry', fieldbackground=self.FIELD, foreground=self.FG)
            style.configure('TCheckbutton', background=self.CARD, foreground=self.FG)
            style.map('TCheckbutton', background=[('active', self.CARD)])
            style.configure('Horizontal.TProgressbar', troughcolor='#334155', background=self.ACCENT, bordercolor='#334155')
            style.configure('Book.Treeview', background=self.FIELD, fieldbackground=self.FIELD, foreground=self.FG, borderwidth=0, rowheight=29)
            style.configure('Book.Treeview.Heading', background=self.CARD, foreground=self.ACCENT, font=('Segoe UI Semibold', 10), relief='flat')
            style.map('Book.Treeview', background=[('selected','#256c72')], foreground=[('selected','#ffffff')])

        def _layout(self):
            main = ttk.Frame(self.root, padding=18)
            main.pack(fill='both', expand=True)
            head = ttk.Frame(main)
            head.pack(fill='x', pady=(0, 5))
            ttk.Label(head, text=APP_NAME, style='Title.TLabel').pack(anchor='w')
            self.subtitle = ttk.Label(head, text='Version 1 · Character voices · Offline GUI + CLI', style='Muted.TLabel')
            self.subtitle.pack(anchor='w')
            toolbar = ttk.Frame(main)
            toolbar.pack(fill='x', pady=(0, 7))
            top_actions = [('Open', self.open_file), ('Save', self.save_text), ('Text tools', self.tools_dialog), ('Find / Replace', self.find_replace)]
            more_actions = [('Combine Chapters', self.book_studio), ('Character Voices', self.character_voice_studio), ('Text + Images → Video', self.video_dialog), ('Statistics', self.show_stats)]
            if GUTENBERG_ENABLED:
                more_actions.append(('Gutenberg Mode', self.gutenberg_mode))
            for index, actions in enumerate((top_actions, more_actions)):
                bar = ttk.Frame(toolbar)
                if index == 1:
                    self.secondary_toolbar = bar
                bar.pack(fill='x')
                for label, callback in actions:
                    ttk.Button(bar, text=label, command=callback).pack(side='left', padx=(0, 3), pady=1)
            bottom = ttk.Frame(main)
            bottom.pack(side='bottom', fill='x')
            ttk.Label(bottom, textvariable=self.status_var, style='Muted.TLabel').pack(anchor='w')
            stats = ttk.Frame(bottom)
            stats.pack(fill='x')
            ttk.Label(stats, textvariable=self.counters_var, style='Muted.TLabel').pack(side='left')
            self.progress = ttk.Progressbar(stats, orient='horizontal', length=120, mode='determinate')
            self.progress.pack(side='right')

            controls = ttk.Frame(main)
            controls.pack(side='bottom', fill='x', pady=(5, 2))
            playback = ttk.Frame(controls)
            playback.pack(fill='x')
            actions = ttk.Frame(controls)
            actions.pack(fill='x')
            self.speak_btn = ttk.Button(playback, text='Speak', command=self.speak, style='Accent.TButton')
            self.speak_btn.pack(side='left', padx=(0, 4))
            self.pause_btn = ttk.Button(playback, textvariable=self.pause_var, command=self.pause)
            self.pause_btn.pack(side='left', padx=(0, 4))
            self.stop_btn = ttk.Button(playback, text='Stop', command=self.stop)
            self.stop_btn.pack(side='left', padx=(0, 4))
            self.export_btn = ttk.Button(actions, text='Export audio', command=self.export, style='Accent.TButton')
            self.export_btn.pack(side='left', padx=(0, 4), pady=(3, 0))
            self.video_btn = ttk.Button(actions, text='Video', command=self.video_dialog)
            self.video_btn.pack(side='left', padx=(0, 4), pady=(3, 0))
            self.batch_btn = ttk.Button(actions, text='Batch', command=self.batch)
            self.batch_btn.pack(side='left', padx=(0, 4), pady=(3, 0))
            work = ttk.Frame(main)
            work.pack(fill='both', expand=True)
            work.columnconfigure(0, weight=1)
            work.columnconfigure(1, weight=0, minsize=275)
            work.rowconfigure(0, weight=1)
            left = ttk.Frame(work)
            left.grid(row=0, column=0, sticky='nsew', padx=(0, 8))
            editor_header = ttk.Frame(left)
            editor_header.pack(fill='x', pady=(0, 5))
            ttk.Label(editor_header, text='TEXT TO SPEAK').pack(side='left')
            ttk.Button(editor_header, text='Insert IPA', command=self.insert_inline_ipa).pack(side='right')
            ttk.Button(editor_header, text='Correct all OCR', command=lambda: self.spelling.correct_all()).pack(side='right', padx=3)
            ttk.Button(editor_header, text='Import scans', command=self.import_scans).pack(side='right', padx=3)
            editor_frame = tk.Frame(left, bg=self.FIELD, highlightthickness=1, highlightbackground='#334155')
            editor_frame.pack(fill='both', expand=True)
            self.editor = tk.Text(editor_frame, wrap='word', undo=True, bg=self.FIELD, fg='#f5f6fa', insertbackground=self.ACCENT, selectbackground='#256c72', relief='flat', padx=17, pady=15, height=1, width=1, font=('Segoe UI', 12), highlightthickness=0, spacing2=3, spacing3=7)
            scroll = ttk.Scrollbar(editor_frame, orient='vertical', command=self.editor.yview)
            self.editor.configure(yscrollcommand=scroll.set)
            self.editor.pack(side='left', fill='both', expand=True)
            scroll.pack(side='right', fill='y')
            self.editor.insert('1.0', 'Welcome to Openmukti Audiobook Maker!\n\nEnter text, choose a voice, then select Speak or Export audio. All built-in speech engines work locally.')
            right_shell, right, _ = scrollable_area(work, padding=7, background=self.CARD, panel_style='Panel.TFrame')
            right_shell.grid(row=0, column=1, sticky='nsew')
            right.columnconfigure(0, weight=1)
            ttk.Label(right, text='VOICE SETTINGS', style='PanelTitle.TLabel').pack(fill='x', pady=(0, 6))
            ttk.Label(right, text='Speaker for untagged text', style='Panel.TLabel').pack(anchor='w')
            self.character_combo = ttk.Combobox(right, textvariable=self.active_character_var, values=['Narrator'], state='readonly')
            self.character_combo.pack(fill='x')
            ttk.Checkbutton(right, text='Apply character profiles to Speak / Audio / Video / Batch',variable=self.use_character_voices_var).pack(anchor='w', pady=(3, 2))
            ttk.Button(right, text='Edit all character voices', command=self.character_voice_studio).pack(fill='x',pady=(0,4))

            def label(s):
                ttk.Label(right, text=s, style='Panel.TLabel').pack(anchor='w', pady=(3, 1))
            label('Speech engine')
            choices = ['auto'] + [key for key, e in self.engines.items() if e.available()]
            self.engine_combo = ttk.Combobox(right, textvariable=self.engine_var, values=choices, state='readonly')
            self.engine_combo.pack(fill='x')
            self.engine_combo.bind('<<ComboboxSelected>>', lambda _ev: self.refresh_voices())
            label('Voice')
            self.voice_combo = ttk.Combobox(right, textvariable=self.voice_var)
            self.voice_combo.pack(fill='x')
            ttk.Button(right, text='Refresh installed voices', command=self.refresh_voices).pack(fill='x', pady=(2, 0))
            ttk.Button(right, text='Download Piper voices by language', command=self.voice_downloader).pack(fill='x', pady=(4, 0))
            ttk.Button(right, text='Add local Piper model + configuration', command=self.add_piper_voice).pack(fill='x', pady=(3, 0))
            label('Piper model (optional manual path)')
            model_row = ttk.Frame(right, style='Panel.TFrame')
            model_row.pack(fill='x')
            ttk.Entry(model_row, textvariable=self.model_var).pack(side='left', fill='x', expand=True)
            ttk.Button(model_row, text='…', command=self.pick_model, width=3).pack(side='left', padx=(5, 0))
            self._scale(right, 'Rate', self.rate_var, -10, 10)
            self._scale(right, 'Pitch (eSpeak NG)', self.pitch_var, -10, 10)
            self._scale(right, 'Volume', self.volume_var, 0, 100)
            label('Word substitutions (JSON/TSV)')
            dicrow = ttk.Frame(right, style='Panel.TFrame')
            dicrow.pack(fill='x')
            ttk.Entry(dicrow, textvariable=self.dict_var).pack(side='left', fill='x', expand=True)
            ttk.Button(dicrow, text='…', command=self.pick_dictionary, width=3).pack(side='left', padx=(5, 0))
            label('IPA pronunciations (language-specific JSON/TSV)')
            iparow = ttk.Frame(right, style='Panel.TFrame')
            iparow.pack(fill='x')
            ttk.Entry(iparow,textvariable=self.ipa_dict_var).pack(side='left',fill='x',expand=True)
            ttk.Button(iparow,text='…',width=3,command=self.pick_ipa_dictionary).pack(side='left',padx=(5,0))
            ttk.Button(right,text='Edit IPA pronunciations',command=self.ipa_editor).pack(fill='x',pady=(3,0))
            ttk.Checkbutton(right, text='Clean OCR line wrapping', variable=self.ocr_var).pack(anchor='w', pady=(6, 0))
            ttk.Label(right, text='Pause starts at the next chunk.', style='Panel.TLabel').pack(anchor='w', pady=(4, 0))
        def _scale(self, parent, label_text, variable, minimum, maximum):
            group = ttk.Frame(parent, style='Panel.TFrame')
            group.pack(fill='x', pady=(4, 0))
            ttk.Label(group, text=label_text, style='Panel.TLabel').pack(side='left')
            val_label = ttk.Label(group, textvariable=variable, style='Panel.TLabel')
            val_label.pack(side='right')
            tk.Scale(parent, variable=variable, from_=minimum, to=maximum, resolution=1, orient='horizontal', showvalue=False, bg=self.CARD, troughcolor='#334155', fg=self.FG, highlightthickness=0, relief='flat', activebackground=self.ACCENT, length=200, width=9, sliderlength=16, borderwidth=0).pack(fill='x')

        def toggle_fullscreen(self, _event=None):
            enabled = bool(self.root.attributes('-fullscreen'))
            self.root.attributes('-fullscreen', not enabled)
            if enabled:
                self.root.after(100, lambda: keep_window_visible(self.root))
            return 'break'

        def escape_action(self, _event=None):
            if self.root.attributes('-fullscreen'):
                self.root.attributes('-fullscreen', False)
                self.root.after(100, lambda: keep_window_visible(self.root))
                return 'break'
            self.stop()

        def _bindings(self):
            self.root.bind('<Control-o>', lambda _ev: self.open_file())
            self.root.bind('<Control-Shift-o>', lambda _ev: self.open_entire_project())
            self.root.bind('<Control-Shift-s>', lambda _ev: self.export_entire_project())
            self.root.bind('<Control-s>', lambda _ev: self.save_text())
            self.root.bind('<F5>', lambda _ev: self.speak())
            self.root.bind('<Escape>', self.escape_action)
            self.root.bind('<F11>', self.toggle_fullscreen)
            self.root.bind('<Control-f>', lambda _ev: self.find_replace())
            self.root.bind('<Control-h>', lambda _ev: self.find_replace())
            self.root.bind('<Control-a>', self.select_all)
            self.root.bind('<Control-plus>', lambda _ev: self.resize_text(1))
            self.root.bind('<Control-minus>', lambda _ev: self.resize_text(-1))

        def pick_model(self):
            path = filedialog.askopenfilename(filetypes=[('Piper model', '*.onnx'), ('All files', '*.*')])
            if path:
                self.model_var.set(path)
                if self.engines['piper'].available():
                    self.engine_var.set('piper')
                    self.voice_var.set('')
                    self.refresh_voices()

        def add_piper_voice(self):
            source = filedialog.askopenfilename(title='Select downloaded Piper .onnx voice model', filetypes=[('Piper voice model', '*.onnx')])
            if not source:
                return
            self.status_var.set('Installing Piper voice files…')
            def work():
                try:
                    voice = install_voice(source)
                    self.events.put(('piper_installed', voice.name, str(voice.model)))
                except Exception as exc:
                    self.events.put(('error', f'Unable to add Piper voice: {exc}'))
            threading.Thread(target=work, daemon=True).start()

        def _show_document(self, title, filename):
            import importlib.resources
            source = importlib.resources.files('openvoice').joinpath('resources', filename)
            content = source.read_text(encoding='utf-8')
            window, panel = self._dialog(title, 920, 710, padding=12, scroll=False)
            ttk.Label(panel, text=title, style='Title.TLabel').pack(anchor='w', pady=(0, 10))
            row = ttk.Frame(panel)
            row.pack(fill='both', expand=True)
            editor = tk.Text(row, wrap='word', bg=self.FIELD, fg=self.FG, insertbackground=self.FG, font=('Segoe UI', 11), padx=16, pady=14)
            bar = ttk.Scrollbar(row, command=editor.yview)
            editor.configure(yscrollcommand=bar.set)
            editor.pack(side='left', fill='both', expand=True)
            bar.pack(side='right', fill='y')
            editor.insert('1.0', content)
            editor.configure(state='disabled')
            ttk.Button(panel, text='Close', command=window.destroy).pack(anchor='e', pady=(10, 0))

        def show_manual(self):
            self._show_document(f'{APP_NAME} — Complete User Manual', 'USER_MANUAL.txt')

        def piper_help(self):
            self._show_document('Install and Use Piper Voices', 'PIPER_SETUP.txt')

        def naming_help(self):
            self._show_document('How to Name Book and Chapter Cover Files', 'FILE_NAMING.txt')

        def about_us(self):
            messagebox.showinfo('About Us', f'{APP_NAME}\nVersion 1\n\nCreated by Aishik Dutta\nOpen-source developer\n\nAn open-source desktop and command-line tool for speech, audiobook audio, cover-based videos and bulk chapter processing.\n\nProject license: MIT. Third-party engines and voices have their own licenses.', parent=self.root)

        def pick_dictionary(self):
            path = filedialog.askopenfilename(filetypes=[('Dictionaries', '*.json *.tsv *.dic *.txt'), ('All files', '*.*')])
            if path:
                self.dict_var.set(path)

        def pick_ipa_dictionary(self):
            source=filedialog.askopenfilename(filetypes=[('IPA dictionaries','*.json *.tsv *.dic *.txt'),('All files','*.*')])
            if source:
                self.ipa_dict_var.set(source)

        def ipa_editor(self):
            import json
            from .ipa_pronunciation import load_pronunciations,PronunciationError
            window,panel=self._dialog('IPA Pronunciation Editor — All Languages',800,625)
            ttk.Label(panel,text='Custom IPA pronunciations (word, IPA, language, spoken fallback)',style='Title.TLabel').pack(anchor='w')
            ttk.Label(panel,text='Language examples: en, bn, hi, fr, ja, * for all languages. Piper Python uses supported IPA phonemes directly. A spoken fallback works with other engines.',wraplength=650).pack(anchor='w',pady=(5,8))
            inputs=ttk.Frame(panel)
            inputs.pack(fill='x')
            word=tk.StringVar()
            ipa=tk.StringVar()
            language=tk.StringVar(value='*')
            spoken=tk.StringVar()
            for title,var in [('Word / phrase',word),('IPA /.../',ipa),('Language code',language),('Spoken fallback (optional)',spoken)]:
                ttk.Label(inputs,text=title).pack(anchor='w')
                ttk.Entry(inputs,textvariable=var).pack(fill='x',pady=(0,4))
            tree=ttk.Treeview(panel,columns=('ipa','language','spoken'),show='tree headings',height=7)
            tree.heading('#0',text='Word')
            tree.column('#0',width=140)
            for key,title,w in [('ipa','IPA',170),('language','Language',90),('spoken','Fallback',130)]:
                tree.heading(key,text=title)
                tree.column(key,width=w)
            tree.pack(fill='both',expand=True)
            rows=[]
            def show():
                tree.delete(*tree.get_children())
                for i,item in enumerate(rows):
                    tree.insert('','end',iid=str(i),text=item['word'],values=(item['ipa'],item['language'],item['spoken']))
            def choose(_event=None):
                selected=tree.selection()
                if selected:
                    item=rows[int(selected[0])]
                    for var,key in [(word,'word'),(ipa,'ipa'),(language,'language'),(spoken,'spoken')]:
                        var.set(item[key])
            tree.bind('<<TreeviewSelect>>',choose)
            def add():
                if not word.get().strip() or not ipa.get().strip():
                    messagebox.showerror('IPA entry','Enter a word and an IPA transcription.',parent=window)
                    return
                item=dict(word=word.get().strip(),ipa=ipa.get().strip(),language=language.get().strip() or '*',spoken=spoken.get().strip())
                selected=tree.selection()
                if selected:
                    rows[int(selected[0])]=item
                else:
                    rows.append(item)
                show()
            def remove():
                for selected in sorted(tree.selection(),key=int,reverse=True):
                    rows.pop(int(selected))
                show()
            def load():
                filename=filedialog.askopenfilename(parent=window,filetypes=[('IPA dictionary','*.json *.tsv *.txt')])
                if filename:
                    try:
                        rows[:]=[r.__dict__ for r in load_pronunciations([filename])]
                        self.ipa_dict_var.set(filename)
                        show()
                    except Exception as exc:
                        messagebox.showerror('IPA dictionary',str(exc),parent=window)
            def save():
                filename=filedialog.asksaveasfilename(parent=window,defaultextension='.json',filetypes=[('JSON','*.json')])
                if filename:
                    try:
                        Path(filename).write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
                        load_pronunciations([filename])
                        self.ipa_dict_var.set(filename)
                        messagebox.showinfo('IPA dictionary','Saved and activated your IPA dictionary.',parent=window)
                    except Exception as exc:
                        messagebox.showerror('IPA dictionary',str(exc),parent=window)
            existing=self.ipa_dict_var.get().strip()
            if existing:
                try:
                    rows[:]=[r.__dict__ for r in load_pronunciations([existing])]
                    show()
                except Exception as exc:
                    messagebox.showwarning('IPA dictionary',str(exc),parent=window)
            actions=ttk.Frame(panel)
            actions.pack(fill='x',pady=7)
            adaptive_grid(actions,[('Add / Update',add),('Delete',remove),('Open',load),('Save + Activate',save),('IPA Help',lambda:self._show_document('IPA Pronunciation Guide','IPA_GUIDE.txt'))],columns=2)

        def insert_inline_ipa(self):
            from .ipa_pronunciation import _clean_ipa, PronunciationError
            window, panel = self._dialog('Insert an IPA pronunciation', 480, 320, min_width=340, min_height=265)
            ttk.Label(panel, text='Insert phonetic speech directly in your story', style='PanelTitle.TLabel').pack(anchor='w', pady=(0, 9))
            ttk.Label(panel, text='IPA transcription (example: həˈloʊ)').pack(anchor='w')
            transcription = tk.StringVar()
            ipa_entry = ttk.Entry(panel, textvariable=transcription)
            ipa_entry.pack(fill='x', pady=(2, 10))
            ttk.Label(panel, text='Optional regular-text fallback (example: hello)').pack(anchor='w')
            fallback = tk.StringVar()
            ttk.Entry(panel, textvariable=fallback).pack(fill='x', pady=(2, 10))
            ttk.Label(panel, text='Works with Narrator and character tags. Piper Python plus a compatible model is needed for direct IPA; other engines require the regular-text fallback.', wraplength=380, justify='left').pack(fill='x', pady=(2, 8))
            def insert():
                try:
                    ipa = _clean_ipa(transcription.get())
                    ordinary = fallback.get().strip()
                    if any(x in ipa for x in '<>|') or any(x in ordinary for x in '<>|\n'):
                        raise PronunciationError('Angle brackets, vertical bars and newlines cannot occur inside IPA tags.')
                    tag = f'<ipa:{ipa}' + (f'|{ordinary}' if ordinary else '') + '>'
                    self.editor.insert('insert', tag)
                    self.editor.focus_set()
                    self.update_stats()
                    window.destroy()
                except PronunciationError as exc:
                    messagebox.showerror('IPA pronunciation', str(exc), parent=window)
            ttk.Button(panel, text='Insert into text', command=insert, style='Accent.TButton').pack(anchor='e')
            ipa_entry.focus_set()

        def refresh_voices(self):
            self.status_var.set('Checking available voices…')
            engine_name = self.engine_var.get()
            model_path = self.model_var.get()

            def work():
                try:
                    engine = get_engine(engine_name, model_path)
                    names = engine.voices()
                    self.events.put(('voices', engine.key, names))
                except Exception as exc:
                    self.events.put(('error_voices', str(exc)))
            threading.Thread(target=work, daemon=True).start()

        def open_file(self):
            path = filedialog.askopenfilename(filetypes=[('Supported documents', '*.txt *.md *.html *.htm *.docx *.epub *.pdf *.rtf *.srt *.vtt *.png *.jpg *.jpeg *.tif *.tiff *.bmp *.webp *.zip *.cbz'), ('All files', '*.*')])
            if not path:
                return
            if Path(path).suffix.lower() in SCAN_EXTENSIONS:
                show_ocr_import(self, [path])
                return
            try:
                content = read_document(path)
            except Exception as exc:
                messagebox.showerror('Unable to import document', str(exc))
                return
            self.editor.delete('1.0', 'end')
            self.editor.insert('1.0', content)
            self.update_stats()
            self.current_file = Path(path)
            self.status_var.set(f'Imported {self.current_file.name} ({len(content):,} characters)')

        def insert_file(self):
            path = filedialog.askopenfilename()
            if path:
                if Path(path).suffix.lower() in SCAN_EXTENSIONS:
                    show_ocr_import(self, [path], insert=True)
                    return
                try:
                    self.editor.insert('insert', read_document(path))
                except Exception as exc:
                    messagebox.showerror('Import failed', str(exc))

        def import_scans(self):
            show_ocr_import(self)

        def import_scan_folder(self):
            folder = filedialog.askdirectory(parent=self.root, title='Choose naturally numbered book page images')
            if folder:
                show_ocr_import(self, [folder])

        def save_text(self):
            default_name = self.current_file.stem + '.txt' if self.current_file else 'speech.txt'
            path = filedialog.asksaveasfilename(defaultextension='.txt', initialfile=default_name, filetypes=[('Text files', '*.txt'), ('All files', '*.*')])
            if path:
                try:
                    Path(path).write_text(self.editor.get('1.0', 'end-1c'), encoding='utf-8')
                    self.status_var.set(f'Saved text: {path}')
                except OSError as exc:
                    messagebox.showerror('Save failed', str(exc))

        def clear(self):
            if not self.active:
                self.editor.delete('1.0', 'end')

        def _set_icon(self):
            try:
                import importlib.resources
                import tkinter as tk
                icon = importlib.resources.files('openvoice').joinpath('resources', 'openmukti-icon.png')
                self._icon = tk.PhotoImage(data=icon.read_bytes())
                self.root.iconphoto(True, self._icon)
            except Exception:
                pass

        def voice_downloader(self):
            window, panel = self._dialog('Download Piper Voices — Search and Filter by Language', 900, 650, padding=10)
            ttk.Label(panel, text='DOWNLOAD PIPER NEURAL VOICES', style='Title.TLabel').pack(anchor='w')
            ttk.Label(panel, text='The official catalog is loaded online. Select voice models to install. Model size can be large.\nVoice age/gender are not certified in this catalog. Review individual voice information and licenses.', style='Muted.TLabel').pack(anchor='w', pady=8)
            row = ttk.Frame(panel)
            row.pack(fill='x', pady=5)
            language = tk.StringVar(value='All languages')
            query = tk.StringVar()
            languages = ttk.Combobox(row, state='readonly', textvariable=language, width=32, values=['All languages'])
            languages.pack(side='left', padx=(0, 8))
            ttk.Entry(row, textvariable=query, width=36).pack(side='left', fill='x', expand=True)
            cols=('language','voice','quality','speakers','MB')
            tree = ttk.Treeview(panel, columns=cols, show='headings', selectmode='extended')
            for key,width in [('language',200),('voice',250),('quality',100),('speakers',85),('MB',100)]:
                tree.heading(key,text=key.title())
                tree.column(key,width=width,stretch=key in ('language','voice'))
            tree.pack(fill='both', expand=True, pady=8)
            state={'catalog':[], 'shown':{}, 'busy':False}
            status = tk.StringVar(value='Click Load Voice Catalog to browse available voices.')
            ttk.Label(panel,textvariable=status).pack(anchor='w')
            def update():
                if not window.winfo_exists():
                    return
                tree.delete(*tree.get_children())
                state['shown']={}
                for v in state['catalog']:
                    tag=f'{v.language_name} ({v.language})'
                    if language.get()!='All languages' and tag!=language.get():
                        continue
                    if query.get().casefold() not in (v.key+' '+tag+' '+v.quality).casefold():
                        continue
                    item=tree.insert('', 'end', values=(tag,v.key,v.quality,v.speakers,round((v.model_bytes+v.config_bytes)/1048576,1)))
                    state['shown'][item]=v
                status.set(f'{len(state["shown"])} models shown. Ctrl/Shift-click to select multiple voices.')
            languages.bind('<<ComboboxSelected>>', lambda e:update())
            query.trace_add('write',lambda *_:update())
            def load():
                if state['busy']:
                    return
                state['busy']=True
                status.set('Downloading or loading the official Piper catalog…')
                def worker():
                    try:
                        voices=fetch_catalog()
                        def success():
                            if window.winfo_exists():
                                state['catalog']=voices
                                languages.configure(values=['All languages']+catalog_languages(voices))
                                update()
                            state['busy']=False
                        self.events.put(('ui',success))
                    except Exception as exc:
                        err=str(exc)
                        def fail():
                            state['busy']=False
                            if window.winfo_exists():
                                messagebox.showerror('Voice catalog',err,parent=window)
                        self.events.put(('ui',fail))
                threading.Thread(target=worker,daemon=True).start()
            def download(all_visible=False,all_catalog=False):
                if state['busy']:
                    return
                selected = list(state['catalog']) if all_catalog else list(state['shown'].values()) if all_visible else [state['shown'][x] for x in tree.selection() if x in state['shown']]
                if not selected:
                    messagebox.showinfo('No selection','Select one or more voices first.',parent=window)
                    return
                size=voice_download_size(selected)/1048576
                if not messagebox.askyesno('Confirm voice downloads',f'Download {len(selected)} model(s), approximately {size:,.1f} MB?\n\nEach voice includes an .onnx model and .onnx.json configuration. Network usage and disk requirements may be substantial.',parent=window):
                    return
                state['busy']=True
                status.set('Downloading and verifying Piper voice files…')
                def worker():
                    try:
                        paths=download_selected(selected,progress=lambda n,total,key:self.events.put(('ui',lambda n=n,total=total,key=key: status.set(f'Downloading {n}/{total}: {key}') if window.winfo_exists() else None)))
                        def success():
                            state['busy']=False
                            if window.winfo_exists():
                                status.set(f'Installed {len(paths)} voices. Use the Voice list or Character Voices.')
                                messagebox.showinfo('Download complete',f'Installed {len(paths)} Piper voices.',parent=window)
                            self.refresh_voices()
                        self.events.put(('ui',success))
                    except Exception as exc:
                        err=str(exc)
                        def fail():
                            state['busy']=False
                            if window.winfo_exists():
                                status.set('Download failed: '+err[:150])
                                messagebox.showerror('Voice download failed',err,parent=window)
                        self.events.put(('ui',fail))
                threading.Thread(target=worker,daemon=True).start()
            buttons=ttk.Frame(panel)
            buttons.pack(fill='x',pady=8)
            adaptive_grid(buttons,[('Load Voice Catalog',load),('Download Selected',download),('Download All Shown',lambda:download(all_visible=True)),('Download Entire Catalog',lambda:download(all_catalog=True))],columns=2)
            load()

        def character_voice_studio(self):
            window, panel = self._dialog('Character Voices — Narrator and Dialogue Studio', 1020, 790, min_width=570, min_height=430, padding=10)
            ttk.Label(panel,text='CHARACTER VOICES',style='Title.TLabel').pack(anchor='w')
            ttk.Label(panel,text='Use [Narrator] or [Character Name] at the start of a line. Each tagged passage can use a different Piper ONNX voice.\nAdd profiles manually or detect names from dialogue attribution (review before export).',style='Muted.TLabel',wraplength=580).pack(anchor='w',pady=8)
            upper=ttk.Frame(panel)
            upper.pack(fill='both',expand=True)
            left=ttk.Frame(upper)
            right=ttk.Frame(upper)
            arrangement={'stacked':None}
            def layout_voice_columns(_event=None):
                stacked=window.winfo_width()<920
                if stacked==arrangement['stacked']:
                    return
                left.pack_forget()
                right.pack_forget()
                if stacked:
                    left.pack(side='top',fill='both',expand=True,pady=(0,10))
                    right.pack(side='top',fill='x')
                else:
                    left.pack(side='left',fill='both',expand=True,padx=(0,12))
                    right.pack(side='right',fill='both',expand=True)
                arrangement['stacked']=stacked
            window.bind('<Configure>',layout_voice_columns,add='+')
            layout_voice_columns()
            ttk.Label(left,text='Character voice profiles').pack(anchor='w')
            tree=ttk.Treeview(left,columns=('voice','language','gender','age','style'),show='tree headings',height=9)
            tree.heading('#0',text='Character')
            tree.column('#0',width=105)
            for c,w in [('voice',145),('language',90),('gender',70),('age',80),('style',85)]:
                tree.heading(c,text=c.title())
                tree.column(c,width=w)
            tree.pack(fill='both',expand=True)
            name=tk.StringVar(value='Narrator')
            voice=tk.StringVar()
            language=tk.StringVar(value='auto')
            gender=tk.StringVar(value='Unspecified')
            age=tk.StringVar(value='Unspecified')
            style=tk.StringVar(value='natural')
            rate=tk.IntVar(value=0)
            pitch=tk.IntVar(value=0)
            design_strength=tk.DoubleVar(value=85.0)
            design_summary=tk.StringVar(value='')
            def update_design(*_args):
                draft=CharacterProfile(name.get() or 'Character',gender=gender.get(),age=age.get(),characteristics=style.get(),pitch=pitch.get(),design_strength=design_strength.get())
                result=design_for_profile(draft)
                design_summary.set(f'Audio effect: pitch {result.semitones:+.1f} semitones, speed {result.speed_adjust:+d}, bass {result.bass_db:+.1f} dB, treble {result.treble_db:+.1f} dB')
            def refresh(select=''):
                self._refresh_character_selector()
                tree.delete(*tree.get_children())
                for profile in self.voice_project.profiles:
                    item=tree.insert('','end',text=profile.name,values=(profile.voice or 'Auto',profile.language,profile.gender,profile.age,profile.characteristics))
                    if profile.name==select:
                        tree.selection_set(item)
                if self.voice_project.profiles and not tree.selection():
                    tree.selection_set(tree.get_children()[0])
            def select(_event=None):
                selection=tree.selection()
                if not selection:
                    return
                existing=next((x for x in self.voice_project.profiles if x.name==tree.item(selection[0],'text')),None)
                if existing:
                    for var,value in [(name,existing.name),(voice,existing.voice),(language,existing.language),(gender,existing.gender),(age,existing.age),(style,existing.characteristics),(rate,existing.rate),(pitch,existing.pitch),(design_strength,existing.design_strength)]:
                        var.set(value)
            tree.bind('<<TreeviewSelect>>',select)
            ttk.Label(right,text='Profile details').pack(anchor='w')
            for label,var in [('Character',name),('Language ISO code, e.g. en-US or bn-BD',language)]:
                ttk.Label(right,text=label).pack(anchor='w',pady=(6,0))
                ttk.Entry(right,textvariable=var).pack(fill='x')
            ttk.Label(right,text='Piper model (installed voice or full ONNX path)').pack(anchor='w',pady=(6,0))
            ttk.Combobox(right,textvariable=voice,values=['']+[v.name for v in discover_voices()]).pack(fill='x')
            ttk.Label(right,text='Speech rate (-10 to +10)').pack(anchor='w',pady=(5,0))
            ttk.Spinbox(right,from_=-10,to=10,textvariable=rate,width=10).pack(anchor='w')
            ttk.Label(right,text='Pitch correction (-10 to +10; post-processes all Piper voices)').pack(anchor='w',pady=(5,0))
            ttk.Spinbox(right,from_=-10,to=10,textvariable=pitch,width=10).pack(anchor='w')
            for label,var,values in [('Voice presentation',gender,['Unspecified','Female','Male','Nonbinary','Androgynous']),('Character age',age,['Unspecified','Child','Teen','Young adult','Adult','Middle aged','Senior']),('Voice personality (combine styles with commas)',style,sorted(STYLE_DESIGNS))]:
                ttk.Label(right,text=label).pack(anchor='w',pady=(6,0))
                ttk.Combobox(right,textvariable=var,values=values).pack(fill='x')
            ttk.Label(right,text='Voice transformation strength (0=original, 100=full)').pack(anchor='w',pady=(8,0))
            ttk.Scale(right,from_=0,to=100,variable=design_strength,orient='horizontal').pack(fill='x')
            ttk.Label(right,textvariable=design_summary,style='Muted.TLabel',wraplength=350).pack(fill='x',pady=5)
            for variable in (gender,age,style,pitch,design_strength):
                variable.trace_add('write',update_design)
            update_design()
            def save_profile():
                title=name.get().strip()
                if not title:
                    messagebox.showerror('Profile','Enter a character name',parent=window)
                    return
                p=next((p for p in self.voice_project.profiles if p.name.casefold()==title.casefold()),None)
                if p is None:
                    p=CharacterProfile(title)
                    self.voice_project.profiles.append(p)
                p.voice=voice.get().strip()
                p.language=language.get().strip() or 'auto'
                p.gender=gender.get()
                p.age=age.get()
                p.characteristics=style.get()
                p.rate=max(-10,min(10,rate.get()))
                p.pitch=max(-10,min(10,pitch.get()))
                p.design_strength=max(0,min(100,round(design_strength.get())))
                refresh(title)
            ttk.Button(right,text='Save / Add Profile',command=save_profile).pack(fill='x',pady=6)
            def preview_voice():
                save_profile()
                from .character_voices import parse_passages
                from .engines.builtin import play_wav
                import tempfile
                script=editor.get('1.0','end-1c')
                selected=name.get().strip()
                available=[part.text for part in parse_passages(script,self.voice_project.profiles) if part.speaker.casefold()==selected.casefold()]
                sample=available[0][:280] if available else simpledialog.askstring('Character voice sample',f'Enter a short passage for {selected} in the model language:',parent=window)
                if not sample:
                    status.set('Preview cancelled: no text for this character.')
                    return
                status.set('Synthesizing preview for '+selected+'…')
                def worker():
                    try:
                        with tempfile.TemporaryDirectory(prefix='openmukti-voice-preview-') as work:
                            file=Path(work)/'preview.wav'
                            selection=VoiceProject([CharacterProfile(**vars(p)) for p in self.voice_project.profiles],pronunciation_files=[project_ipa.get().strip()] if project_ipa.get().strip() else [])
                            render_multivoice(f'[{selected}] {sample}',file,selection)
                            play_wav(file)
                        self.events.put(('ui',lambda:status.set('Preview played for '+selected) if window.winfo_exists() else None))
                    except Exception as exc:
                        err=str(exc)
                        self.events.put(('ui',lambda:messagebox.showerror('Voice preview failed',err,parent=window) if window.winfo_exists() else None))
                threading.Thread(target=worker,daemon=True).start()
            ttk.Button(right,text='▶ Preview character voice with effects',command=preview_voice).pack(fill='x',pady=(0,6))
            def delete_profile():
                selected=name.get().strip()
                if selected.casefold()=='narrator':
                    messagebox.showwarning('Narrator','The Narrator profile is required.',parent=window)
                    return
                self.voice_project.profiles=[p for p in self.voice_project.profiles if p.name.casefold()!=selected.casefold()]
                refresh()
            ttk.Button(right,text='Delete Character Profile',command=delete_profile).pack(fill='x')
            ttk.Label(panel,text='IPA pronunciation dictionary for character voices (optional; language-scoped rules)').pack(anchor='w',pady=(7,3))
            project_ipa=tk.StringVar(value=self.voice_project.pronunciation_files[0] if self.voice_project.pronunciation_files else self.ipa_dict_var.get())
            pronunciation_row=ttk.Frame(panel)
            pronunciation_row.pack(fill='x')
            ttk.Entry(pronunciation_row,textvariable=project_ipa).pack(side='left',fill='x',expand=True)
            def browse_project_ipa():
                path=filedialog.askopenfilename(parent=window,filetypes=[('IPA rules','*.json *.tsv *.txt')])
                if path:
                    project_ipa.set(path)
            ttk.Button(pronunciation_row,text='Browse',command=browse_project_ipa).pack(side='left')
            ttk.Label(panel,text='Script — one tagged speaker per line (untagged lines use preceding speaker)').pack(anchor='w',pady=(10,4))
            editor=tk.Text(panel,height=11,wrap='word',undo=True,bg=self.FIELD,fg=self.FG,insertbackground=self.FG,font=('Segoe UI',10),padx=10,pady=8)
            editor.pack(fill='both',expand=True)
            editor.insert('1.0',self.voice_project.script or self._get_text())
            if not (self.voice_project.script or self._get_text()).strip():
                editor.insert('1.0','[Narrator] It was a bright morning.\n[Alice] Good morning!\n[Bob] Hello, Alice!')
            status=tk.StringVar(value='Assign a Piper model per character or leave blank for automatic speech engine selection.')
            ttk.Label(panel,textvariable=status).pack(anchor='w',pady=6)
            def save_script():
                save_profile()
                self.voice_project.script=editor.get('1.0','end-1c')
                self.voice_project.pronunciation_files=[project_ipa.get().strip()] if project_ipa.get().strip() else []
            def detect_names():
                script_text=editor.get('1.0','end-1c')
                found=auto_profiles(script_text,installed=[v.name for v in discover_voices()])
                existing={p.name.casefold() for p in self.voice_project.profiles}
                for profile in found.profiles:
                    if profile.name.casefold() not in existing:
                        self.voice_project.profiles.append(profile)
                refresh()
                status.set(f'Detected {len(found.profiles)-1} character names. Suggested voices come from installed models. Please review assignments.')
            def suggest():
                save_profile()
                language.set('auto') if not language.get() else None
                detected=detected_languages(editor.get('1.0','end-1c'))
                if detected:
                    language.set(detected[0][0])
                def worker():
                    try:
                        catalog=fetch_catalog()
                        profile=CharacterProfile(name.get(),language=language.get())
                        choices=recommend_voices(profile,catalog)
                        suggestion=', '.join(v.key for v in choices)
                        self.events.put(('ui',lambda:status.set('Recommended: '+suggestion) if window.winfo_exists() else None))
                    except Exception as exc:
                        err=str(exc)
                        self.events.put(('ui',lambda:status.set('Recommendations unavailable: '+err) if window.winfo_exists() else None))
                threading.Thread(target=worker,daemon=True).start()
            def save_project():
                save_script()
                target=filedialog.asksaveasfilename(parent=window,defaultextension='.json',filetypes=[('Voice project','*.json')])
                if target:
                    self.voice_project.save(target)
                    status.set('Saved voice project: '+target)
            def open_project():
                source=filedialog.askopenfilename(parent=window,filetypes=[('Voice project','*.json')])
                if source:
                    try:
                        self.voice_project=VoiceProject.load(source)
                        editor.delete('1.0','end')
                        editor.insert('1.0',self.voice_project.script)
                        project_ipa.set(self.voice_project.pronunciation_files[0] if self.voice_project.pronunciation_files else '')
                        refresh()
                    except Exception as exc:
                        messagebox.showerror('Project',str(exc),parent=window)
            def export(as_video=False):
                save_script()
                dest=filedialog.asksaveasfilename(parent=window,defaultextension='.mp4' if as_video else '.wav',filetypes=[('Video','*.mp4 *.mkv *.mov *.webm')] if as_video else [('Audio','*.wav *.mp3 *.m4a *.flac *.ogg')])
                if not dest:
                    return
                images=[]
                if as_video:
                    images=list(filedialog.askopenfilenames(parent=window,title='Choose covers/images in order',filetypes=[('Images','*.png *.jpg *.jpeg *.webp *.bmp')]))
                    if not images:
                        return
                script=self.voice_project.script
                project=VoiceProject([CharacterProfile(**vars(p)) for p in self.voice_project.profiles],script,pronunciation_files=[project_ipa.get().strip()] if project_ipa.get().strip() else [])
                status.set('Rendering passages with assigned voices…')
                def worker():
                    try:
                        if as_video:
                            result=render_multivoice_video(script,images,dest,project)
                        else:
                            result=render_multivoice(script,dest,project)
                        self.events.put(('ui',lambda:status.set('Saved: '+str(result)) if window.winfo_exists() else None))
                    except Exception as exc:
                        err=str(exc)
                        self.events.put(('ui',lambda:messagebox.showerror('Export failed',err,parent=window) if window.winfo_exists() else None))
                threading.Thread(target=worker,daemon=True).start()
            refresh()
            actions=ttk.Frame(panel)
            actions.pack(fill='x',pady=8)
            adaptive_grid(actions,[('Find Characters',detect_names),('Detect Language + Recommend',suggest),('Download Piper Voices',self.voice_downloader),('Open Project',open_project),('Save Project',save_project),('Export Audio',export),('Export Video',lambda:export(True))],columns=2)

        def _menus(self):
            menu = tk.Menu(self.root)
            file_menu = tk.Menu(menu, tearoff=False)
            for label, action in [('Open entire project (.oamproj)', self.open_entire_project), ('Export entire project (.oamproj)', self.export_entire_project), ('Open document', self.open_file), ('Insert document', self.insert_file), ('Save text', self.save_text), ('Export audio', self.export), ('Make Video from Text + Images', self.video_dialog), ('Combine Chapters into Audiobooks', self.book_studio), ('Character Voices — Multiple Speakers', self.character_voice_studio), *([('Gutenberg Mode', self.gutenberg_mode)] if GUTENBERG_ENABLED else []), ('Batch convert', self.batch), ('Save voice preset', self.save_preset), ('Load voice preset', self.load_preset), ('Exit', self.close)]:
                file_menu.add_command(label=label, command=action)
            menu.add_cascade(label='File', menu=file_menu)
            file_menu.insert_command(3, label='Import scanned PDF / images / ZIP book…', command=self.import_scans)
            file_menu.insert_command(4, label='Import book page image folder…', command=self.import_scan_folder)
            edit = tk.Menu(menu, tearoff=False)
            for label, action in [('Undo', lambda: self.editor.event_generate('<<Undo>>')), ('Redo', lambda: self.editor.event_generate('<<Redo>>')), ('Cut', lambda: self.editor.event_generate('<<Cut>>')), ('Copy', lambda: self.editor.event_generate('<<Copy>>')), ('Paste', lambda: self.editor.event_generate('<<Paste>>')), ('Select all', self.select_all), ('Find / Replace', self.find_replace), ('Go to line', self.goto_line), ('Clear', self.clear)]:
                edit.add_command(label=label, command=action)
            menu.add_cascade(label='Edit', menu=edit)
            view = tk.Menu(menu, tearoff=False)
            view.add_command(label='Toggle Fullscreen (F11)', command=self.toggle_fullscreen)
            view.add_command(label='Return to Windowed Mode (Esc)', command=lambda: self.root.attributes('-fullscreen', False))
            menu.add_cascade(label='View', menu=view)
            tools = tk.Menu(menu, tearoff=False)
            tools.add_command(label=f'Text tools ({len(TOOLS)} operations)', command=self.tools_dialog)
            tools.add_command(label='Document statistics', command=self.show_stats)
            tools.add_command(label='English spelling / OCR settings…', command=lambda: show_spelling_settings(self))
            tools.add_command(label='Check English spelling', command=lambda: self.spelling.check())
            tools.add_command(label='Correct all OCR / spelling suggestions', command=lambda: self.spelling.correct_all())
            tools.add_command(label='Apply high-confidence OCR fixes only', command=lambda: self.spelling.correct_all(safe_only=True))
            tools.add_command(label='Increase font size', command=lambda: self.resize_text(1))
            tools.add_command(label='Decrease font size', command=lambda: self.resize_text(-1))
            tools.add_command(label='Audio processor', command=self.audio_dialog)
            menu.add_cascade(label='Tools', menu=tools)
            voices = tk.Menu(menu, tearoff=False)
            voices.add_command(label='Refresh installed voices', command=self.refresh_voices)
            voices.add_command(label='Download Piper voices by language', command=self.voice_downloader)
            voices.add_command(label='Character Voice Studio', command=self.character_voice_studio)
            voices.add_command(label='Choose Piper model', command=self.pick_model)
            voices.add_command(label='Add Piper Voice Files', command=self.add_piper_voice)
            voices.add_command(label='How to Install Piper Voices', command=self.piper_help)
            voices.add_command(label='Choose dictionary', command=self.pick_dictionary)
            voices.add_command(label='IPA Pronunciation Editor',command=self.ipa_editor)
            voices.add_command(label='Insert inline IPA in text',command=self.insert_inline_ipa)
            menu.add_cascade(label='Voices', menu=voices)
            help_menu = tk.Menu(menu, tearoff=False)
            help_menu.add_command(label='Complete User Manual', command=self.show_manual)
            help_menu.add_command(label='Scanned books, OCR and English spelling', command=lambda:self._show_document('OCR and English spelling','OCR_AND_SPELLING.txt'))
            help_menu.add_command(label='Set Up Piper Voices', command=self.piper_help)
            help_menu.add_command(label='Inline IPA tags and custom pronunciations',command=lambda:self._show_document('IPA Pronunciation Guide','IPA_GUIDE.txt'))
            help_menu.add_command(label='How to Name Chapter Covers', command=self.naming_help)
            help_menu.add_separator()
            help_menu.add_command(label='About Us', command=self.about_us)
            menu.add_cascade(label='Help', menu=help_menu)
            self.root.config(menu=menu)

        def _get_text(self):
            return self.editor.get('1.0', 'end-1c')

        def _replace_text(self, text):
            self.editor.delete('1.0', 'end')
            self.editor.insert('1.0', text)
            self.update_stats()

        def update_stats(self):
            stats = text_stats(self._get_text())
            self.counters_var.set(f"{stats['words']:,} words · {stats['characters']:,} chars · {stats['estimated_seconds'] / 60:.1f} min")

        def show_stats(self):
            import json
            data = text_stats(self._get_text())
            messagebox.showinfo('Document statistics', json.dumps(data, indent=2, ensure_ascii=False))

        def select_all(self, _event=None):
            self.editor.tag_add('sel', '1.0', 'end-1c')
            self.editor.mark_set('insert', '1.0')
            self.editor.see('insert')
            return 'break'

        def resize_text(self, delta):
            self.font_size = max(8, min(32, self.font_size + delta))
            self.editor.configure(font=('Segoe UI', self.font_size))
            self.status_var.set(f'Editor font size: {self.font_size}')

        def goto_line(self):
            line = simpledialog.askinteger('Go to line', 'Line number:', minvalue=1, parent=self.root)
            if line:
                self.editor.mark_set('insert', f'{line}.0')
                self.editor.see('insert')
                self.editor.focus_set()

        def find_replace(self):
            dialog = tk.Toplevel(self.root)
            dialog.title('Find and replace')
            fit_window(dialog, 470, 250, 340, 220)
            dialog.transient(self.root)
            find_text = tk.StringVar()
            replace_text = tk.StringVar()
            case_sensitive = tk.BooleanVar(value=False)
            frame = ttk.Frame(dialog, padding=12)
            frame.pack(fill='both', expand=True)
            ttk.Label(frame, text='Find').grid(row=0, column=0, sticky='w')
            ttk.Entry(frame, textvariable=find_text, width=42).grid(row=0, column=1, sticky='ew')
            ttk.Label(frame, text='Replace').grid(row=1, column=0, sticky='w')
            ttk.Entry(frame, textvariable=replace_text, width=42).grid(row=1, column=1, sticky='ew')
            ttk.Checkbutton(frame, text='Case sensitive', variable=case_sensitive).grid(row=2, column=1, sticky='w')
            frame.columnconfigure(1, weight=1)

            def find_next():
                term = find_text.get()
                if not term:
                    return
                self.editor.tag_remove('search', '1.0', 'end')
                start = self.editor.index('insert')
                index = self.editor.search(term, start, stopindex='end', nocase=not case_sensitive.get())
                if not index:
                    index = self.editor.search(term, '1.0', stopindex=start, nocase=not case_sensitive.get())
                if index:
                    end = f'{index}+{len(term)}c'
                    self.editor.tag_configure('search', background='#eab308', foreground='#111827')
                    self.editor.tag_add('search', index, end)
                    self.editor.mark_set('insert', end)
                    self.editor.see(index)
                else:
                    messagebox.showinfo('Find', 'No matches found.', parent=dialog)

            def replace_all():
                import re
                needle = find_text.get()
                if not needle:
                    return
                flags = 0 if case_sensitive.get() else re.IGNORECASE
                result, count = re.subn(re.escape(needle), lambda _match: replace_text.get(), self._get_text(), flags=flags)
                self._replace_text(result)
                self.status_var.set(f'Replaced {count} occurrences')
            row = ttk.Frame(frame)
            row.grid(row=3, column=1, sticky='e', pady=8)
            ttk.Button(row, text='Find next', command=find_next).pack(side='left', padx=4)
            ttk.Button(row, text='Replace all', command=replace_all).pack(side='left', padx=4)

        def tools_dialog(self):
            dialog, body = self._dialog('Text preparation and OCR tools', 760, 610, padding=9)
            dialog.transient(self.root)
            search_var = tk.StringVar()
            ttk.Label(body, text=f'Search {len(TOOLS)} available transformations').pack(anchor='w')
            ttk.Entry(body, textvariable=search_var).pack(fill='x', pady=5)
            entries = tk.Listbox(body, bg=self.FIELD, fg=self.FG, selectbackground='#117b70', font=('Segoe UI', 10))
            entries.pack(fill='both', expand=True)
            preview = tk.Text(body, height=7, wrap='word', bg=self.FIELD, fg=self.FG, font=('Segoe UI', 10))
            preview.pack(fill='x', pady=7)
            visible = []

            def repopulate(*_args):
                entries.delete(0, 'end')
                visible.clear()
                query = search_var.get().casefold().strip()
                for op in TOOLS.values():
                    if not query or query in (op.name + ' ' + op.title + ' ' + op.group).casefold():
                        visible.append(op.name)
                        entries.insert('end', f'[{op.group}] {op.title} · {op.name}')

            def selected():
                indices = entries.curselection()
                return visible[indices[0]] if indices else None

            def make_preview(_event=None):
                name = selected()
                if name:
                    try:
                        result = transform(self._get_text(), [name])
                        preview.delete('1.0', 'end')
                        preview.insert('1.0', result[:12000])
                    except ValueError as exc:
                        messagebox.showerror('Text tool', str(exc), parent=dialog)

            def apply_selected():
                name = selected()
                if name:
                    self._replace_text(transform(self._get_text(), [name]))
                    self.status_var.set(f'Applied: {name}')
                    make_preview()
            search_var.trace_add('write', repopulate)
            entries.bind('<<ListboxSelect>>', make_preview)
            row = ttk.Frame(body)
            row.pack(fill='x')
            ttk.Button(row, text='Apply to editor', command=apply_selected).pack(side='right')
            ttk.Button(row, text='Close', command=dialog.destroy).pack(side='right', padx=8)
            repopulate()

        def _refresh_character_selector(self):
            names = [p.name for p in self.voice_project.profiles]
            if getattr(self, 'character_combo', None):
                self.character_combo.configure(values=names)
            if self.active_character_var.get() not in names:
                self.active_character_var.set('Narrator')

        def _effective_project(self, text=''):
            project = copy.deepcopy(self.voice_project)
            project.script = text
            ipa = self.ipa_dict_var.get().strip()
            if ipa and ipa not in project.pronunciation_files:
                project.pronunciation_files.append(ipa)
            return project

        def _tagged_text(self, text):
            if not self.use_character_voices_var.get():
                return text
            speaker = self.active_character_var.get()
            return f'[{speaker}] ' + text if speaker.casefold() != 'narrator' else text

        def _project_snapshot(self):
            settings = {'engine':self.engine_var.get(),'voice':self.voice_var.get(),'model':self.model_var.get(),
                        'dictionary':self.dict_var.get(),'ipa_dictionary':self.ipa_dict_var.get(),
                        'rate':self.rate_var.get(),'pitch':self.pitch_var.get(),'volume':self.volume_var.get(),
                        'ocr':self.ocr_var.get(),'font_size':self.font_size}
            settings['ocr_import'] = self.ocr_settings.copy()
            settings['ocr_report'] = self.ocr_report.copy()
            settings.update(self.spelling.settings())
            return ProjectData(text=self._get_text(),settings=settings,voice_project=copy.deepcopy(self.voice_project),
                books=copy.deepcopy(self.books),video_images=[Path(x) for x in self.video_images],
                video_audio=Path(self.video_audio) if self.video_audio else None,video_settings=self.video_options.copy(),
                book_settings=self.book_export_settings.copy(),current_filename=self.current_file.name if self.current_file else '',
                active_character=self.active_character_var.get(),use_character_voices=self.use_character_voices_var.get())

        def export_entire_project(self):
            if self.active:
                messagebox.showwarning('Project export','Finish the running job first.')
                return
            filename = filedialog.asksaveasfilename(parent=self.root,title='Export complete audiobook project',defaultextension='.oamproj',filetypes=[('Openmukti complete project','*.oamproj')])
            if not filename:
                return
            try:
                save_project(filename,self._project_snapshot())
                self.project_file=Path(filename)
                self.status_var.set('Complete project saved: '+str(filename))
            except Exception as exc:
                messagebox.showerror('Project export failed',str(exc),parent=self.root)

        def open_entire_project(self):
            if self.active:
                messagebox.showwarning('Project import','Finish the running job first.')
                return
            filename=filedialog.askopenfilename(parent=self.root,title='Open complete audiobook project',filetypes=[('Openmukti complete project','*.oamproj')])
            if not filename:
                return
            new_workspace=tempfile.TemporaryDirectory(prefix='openmukti-import-')
            try:
                project=load_project(filename,new_workspace.name)
            except Exception as exc:
                new_workspace.cleanup()
                messagebox.showerror('Project import failed',str(exc),parent=self.root)
                return
            old=self._project_workspace
            self._project_workspace=new_workspace
            self.project_file=Path(filename)
            self._replace_text(project.text)
            self.ocr_settings = project.settings.get('ocr_import', {})
            self.ocr_report = project.settings.get('ocr_report', {})
            self.spelling.restore(project.settings)
            self.voice_project=project.voice_project
            self.books=project.books
            self.video_images=[str(x) for x in project.video_images]
            self.video_audio=str(project.video_audio) if project.video_audio else None
            self.video_options=project.video_settings
            self.book_export_settings=project.book_settings
            self.current_file=None
            for key,var in [('engine',self.engine_var),('voice',self.voice_var),('model',self.model_var),('dictionary',self.dict_var),
                            ('ipa_dictionary',self.ipa_dict_var),('rate',self.rate_var),('pitch',self.pitch_var),
                            ('volume',self.volume_var),('ocr',self.ocr_var)]:
                if key in project.settings:
                    var.set(project.settings[key])
            self.font_size=int(project.settings.get('font_size',self.font_size))
            self.editor.configure(font=('Segoe UI',self.font_size))
            self.active_character_var.set(project.active_character)
            self.use_character_voices_var.set(project.use_character_voices)
            self._refresh_character_selector()
            self.refresh_voices()
            self.update_stats()
            self.status_var.set('Opened complete project: '+str(filename))
            if old is not None:
                old.cleanup()

        def save_preset(self):
            import json
            path = filedialog.asksaveasfilename(defaultextension='.json', filetypes=[('Voice presets', '*.json')])
            if path:
                preset = {'engine': self.engine_var.get(), 'voice': self.voice_var.get(), 'model': self.model_var.get(), 'dictionary': self.dict_var.get(), 'rate': self.rate_var.get(), 'pitch': self.pitch_var.get(), 'volume': self.volume_var.get(), 'ocr': self.ocr_var.get()}
                Path(path).write_text(json.dumps(preset, indent=2), encoding='utf-8')
                self.status_var.set('Voice preset saved')

        def load_preset(self):
            import json
            path = filedialog.askopenfilename(filetypes=[('Voice presets', '*.json')])
            if path:
                try:
                    data = json.loads(Path(path).read_text(encoding='utf-8'))
                    if not isinstance(data, dict) or data.get('engine', 'auto') not in ['auto', *self.engines]:
                        raise ValueError('Unrecognized voice preset')
                    for key, var in [('engine', self.engine_var), ('voice', self.voice_var), ('model', self.model_var), ('dictionary', self.dict_var), ('rate', self.rate_var), ('pitch', self.pitch_var), ('volume', self.volume_var), ('ocr', self.ocr_var)]:
                        if key in data:
                            var.set(data[key])
                    self.refresh_voices()
                    self.status_var.set('Voice preset loaded')
                except (OSError, ValueError, TypeError) as exc:
                    messagebox.showerror('Preset', str(exc))

        def audio_dialog(self):
            filenames = filedialog.askopenfilenames(title='Select one or more audio files')
            if not filenames:
                return
            operation = simpledialog.askstring('Audio operation', 'convert / join / trim / speed / gain / normalize / reverse / fade-in / fade-out / mono / stereo / resample / denoise / compress', initialvalue='normalize', parent=self.root)
            if not operation:
                return
            operation = operation.strip().lower()
            if operation not in ('convert', 'join', 'trim', 'speed', 'gain', 'normalize', 'reverse', 'fade-in', 'fade-out', 'mono', 'stereo', 'resample', 'denoise', 'compress'):
                messagebox.showerror('Audio processing', 'Unknown audio operation')
                return
            output = filedialog.asksaveasfilename(defaultextension='.wav', filetypes=[('Audio', '*.wav *.mp3 *.flac *.ogg *.m4a *.opus *.aac *.aiff *.wma')])
            if not output:
                return
            kwargs = {}
            if operation == 'speed':
                kwargs['speed'] = simpledialog.askfloat('Speed', 'Speed factor 0.25 to 4', initialvalue=1.25, minvalue=0.25, maxvalue=4) or 1
            if operation in ('trim', 'fade-out'):
                kwargs['duration'] = simpledialog.askfloat('Duration', 'Duration in seconds', initialvalue=10, minvalue=0.1) or 0
            if operation == 'gain':
                kwargs['gain'] = simpledialog.askfloat('Gain', 'Change volume in dB', initialvalue=3, minvalue=-60, maxvalue=30) or 0
            if operation == 'resample':
                kwargs['sample_rate'] = simpledialog.askinteger('Sample rate', 'Samples per second', initialvalue=44100, minvalue=8000, maxvalue=192000) or 44100
            self.status_var.set('Processing audio…')

            def task():
                try:
                    result = process_audio(filenames, output, operation=operation, **kwargs)
                    self.events.put(('done', f'Audio saved: {result}'))
                except Exception as exc:
                    self.events.put(('error', str(exc)))
            threading.Thread(target=task, daemon=True).start()

        def _params(self):
            settings = SpeechSettings(voice=self.voice_var.get().strip(), rate=self.rate_var.get(), pitch=self.pitch_var.get(), volume=self.volume_var.get(), model=self.model_var.get().strip())
            dictionary = self.dict_var.get().strip()
            options = JobOptions(repair_ocr=self.ocr_var.get(), dictionaries=(dictionary,) if dictionary else (),ipa_dictionaries=(self.ipa_dict_var.get().strip(),) if self.ipa_dict_var.get().strip() else ())
            return (self.engine_var.get(), settings, options)

        def _launch(self, mode, output=None, files=None, audio_format='wav', images=None, existing_audio=None, video_settings=None):
            if self.active:
                messagebox.showinfo('Speech running', 'Stop the current job first.')
                return
            try:
                engine_name, settings, options = self._params()
                text = self.editor.get('1.0', 'end-1c')
                if mode != 'batch' and not (mode == 'video' and existing_audio) and (not text.strip()):
                    messagebox.showwarning('Missing text', 'Enter some text or open a document.')
                    return
                self.active = True
                self.control = RunControl()
                self.progress['value'] = 0
                self.status_var.set('Processing…')
                self.pause_var.set('Pause between sentences')
                self._set_buttons()
                use_characters=self.use_character_voices_var.get()
                project=self._effective_project() if use_characters else None
                script=self._tagged_text(text)
                batch_prefix=(f'[{self.active_character_var.get()}] ' if use_characters and self.active_character_var.get().casefold()!='narrator' else '')

                def progress(done, total):
                    self.events.put(('progress', done, total))

                def task():
                    try:
                        engine = get_engine(engine_name, settings.model)
                        if mode == 'speak':
                            if project:
                                from .engines.builtin import play_wav
                                with tempfile.TemporaryDirectory(prefix='openmukti-main-preview-') as work:
                                    wav=render_multivoice(script,Path(work)/'preview.wav',project,control=self.control,progress=lambda n,t,_p:progress(n,t),default_engine=engine,default_settings=settings,speech_options=options)
                                    play_wav(wav,self.control)
                            else:
                                speak_text(text, engine, settings, options, self.control, progress)
                            self.events.put(('done', 'Finished speaking.'))
                        elif mode == 'export':
                            rendered = render_multivoice(script,output,project,control=self.control,progress=lambda n,t,_p:progress(n,t),default_engine=engine,default_settings=settings,speech_options=options) if project else render_text(text, output, engine, settings, options, self.control, progress)
                            self.events.put(('done', f'Audio saved: {rendered}'))
                        elif mode == 'video':
                            if project and not existing_audio:
                                result=render_multivoice_video(script,images or [],output,project,video_options=video_settings or VideoOptions(),control=self.control,progress=lambda n,t,_p:progress(n,t),default_engine=engine,default_settings=settings,speech_options=options)
                            else:
                                result=render_video(images or [],output,audio=existing_audio,text=text,engine=engine if not existing_audio else None,settings=settings,speech_options=options,video_options=video_settings or VideoOptions(),control=self.control,progress=progress)
                            self.events.put(('done', f'Video saved: {result}'))
                        elif mode == 'batch':
                            errors = []
                            for i, file in enumerate(files):
                                self.control.check()
                                try:
                                    content = read_document(file)
                                    dest = Path(output) / (Path(file).stem + '.' + audio_format)
                                    render_multivoice(batch_prefix+content,dest,project,control=self.control,default_engine=engine,default_settings=settings,speech_options=options) if project else render_text(content,dest,engine,settings,options,self.control)
                                    self.events.put(('progress', i + 1, len(files)))
                                except Exception as exc:
                                    errors.append(f'{Path(file).name}: {exc}')
                            if errors:
                                self.events.put(('error', 'Some files failed:\n' + '\n'.join(errors[:10])))
                            else:
                                self.events.put(('done', f'Batch complete: {len(files)} {audio_format.upper()} files saved in {output}'))
                    except Exception as exc:
                        self.events.put(('error', str(exc)))
                    finally:
                        self.events.put(('idle',))
                threading.Thread(target=task, daemon=True).start()
            except Exception as exc:
                self.active = False
                messagebox.showerror('Cannot start speech job', str(exc))
                self._set_buttons()

        def video_dialog(self):
            if self.active:
                messagebox.showinfo('Busy', 'Finish or stop the current speech job first.')
                return
            window, panel = self._dialog('Make Video from Text + Images', 720, 600, min_width=480, min_height=370, padding=12)
            window.transient(self.root)
            window.grab_set()
            ttk.Label(panel, text='TEXT + IMAGES TO VIDEO', style='Title.TLabel').pack(anchor='w')
            ttk.Label(panel, text='Add cover art or slides in display order; use the editor text as narration.', style='Muted.TLabel',wraplength=600).pack(anchor='w', pady=(5, 12))
            paths: list[str] = self.video_images
            image_row = ttk.Frame(panel)
            image_row.pack(fill='both', expand=True)
            image_box = tk.Listbox(image_row, bg=self.FIELD, fg=self.FG, selectbackground='#256c72', relief='flat', height=7, selectmode='extended')
            image_box.pack(side='left', fill='both', expand=True)
            controls = ttk.Frame(image_row)
            controls.pack(side='right', fill='y', padx=(8, 0))

            def repaint():
                image_box.delete(0, 'end')
                for item in paths:
                    image_box.insert('end', Path(item).name)

            def add():
                picked = filedialog.askopenfilenames(parent=window, title='Choose images in slide order', filetypes=[('Images', '*.png *.jpg *.jpeg *.webp *.bmp *.tif *.tiff')])
                paths.extend(picked)
                repaint()

            def remove():
                for index in reversed(image_box.curselection()):
                    paths.pop(index)
                repaint()

            def move(step):
                selected = image_box.curselection()
                if len(selected) != 1:
                    return
                index = selected[0]
                dest = index + step
                if 0 <= dest < len(paths):
                    paths[index], paths[dest] = paths[dest], paths[index]
                    repaint()
                    image_box.selection_set(dest)

            for label, action in [('Add images', add), ('Remove', remove), ('Move up', lambda: move(-1)), ('Move down', lambda: move(1))]:
                ttk.Button(controls, text=label, command=action).pack(fill='x', pady=(0, 7))
            dimensions = ttk.Frame(panel)
            dimensions.pack(fill='x', pady=(15, 8))
            aspect = tk.StringVar(value=self.video_options.get('aspect','16:9'))
            resolution = tk.StringVar(value=self.video_options.get('resolution','720p'))
            fps = tk.StringVar(value=str(self.video_options.get('fps',30)))
            fit = tk.StringVar(value=self.video_options.get('fit','contain'))
            for index, (name, var, values) in enumerate([('Aspect ratio', aspect, list(ASPECTS)), ('Resolution', resolution, list(HEIGHTS)), ('Frame rate', fps, ['24', '25', '30', '60']), ('Image scaling', fit, ['contain', 'cover'])]):
                cell = ttk.Frame(dimensions)
                cell.grid(row=0, column=index, padx=(0, 12), sticky='ew')
                dimensions.columnconfigure(index, weight=1)
                ttk.Label(cell, text=name).pack(anchor='w')
                ttk.Combobox(cell, textvariable=var, values=values, state='readonly', width=11).pack(fill='x')
            soundtrack = tk.StringVar(value=self.video_audio or '')
            row = ttk.Frame(panel)
            row.pack(fill='x', pady=(8, 3))
            ttk.Label(row, text='Existing narration file (optional; skips speech synthesis)').pack(anchor='w')
            audio_row = ttk.Frame(panel)
            audio_row.pack(fill='x')
            ttk.Entry(audio_row, textvariable=soundtrack).pack(side='left', fill='x', expand=True)

            def choose_audio():
                found = filedialog.askopenfilename(parent=window, title='Select audio track', filetypes=[('Audio', '*.wav *.mp3 *.flac *.m4a *.ogg *.opus *.aac *.wma'), ('All files', '*.*')])
                if found:
                    soundtrack.set(found)

            ttk.Button(audio_row, text='Browse', command=choose_audio).pack(side='left', padx=(7, 0))
            caption = tk.BooleanVar(value=self.video_options.get('captions',False))
            ttk.Checkbutton(panel, text='Create approximate-timing SRT captions from editor text', variable=caption).pack(anchor='w', pady=(8, 0))
            ttk.Label(panel, text='Output: MP4, MKV, MOV, or WebM. Integrated media tools used when bundled.', style='Muted.TLabel').pack(anchor='w', pady=(4, 0))
            def remember_video(*_args):
                self.video_audio=soundtrack.get().strip() or None
                self.video_options={**self.video_options,'aspect':aspect.get(),'resolution':resolution.get(),'fps':int(fps.get()),
                                    'fit':fit.get(),'captions':caption.get()}
            for v in (aspect,resolution,fps,fit,soundtrack,caption):
                v.trace_add('write',remember_video)
            remember_video()
            repaint()

            def start():
                if not paths:
                    messagebox.showwarning('Missing images', 'Add at least one image.', parent=window)
                    return
                narrative = self.editor.get('1.0', 'end-1c')
                if (not soundtrack.get() or caption.get()) and not narrative.strip():
                    messagebox.showwarning('Missing narration', 'Enter narration text or select existing audio. Captions require text.', parent=window)
                    return
                destination = filedialog.asksaveasfilename(parent=window, defaultextension='.mp4', filetypes=[('MP4 video', '*.mp4'), ('WebM video', '*.webm'), ('Matroska video', '*.mkv'), ('QuickTime video', '*.mov')])
                if not destination:
                    return
                video_settings = VideoOptions(aspect=aspect.get(), resolution=resolution.get(), fps=int(fps.get()), fit=fit.get(), captions=caption.get())
                selections = list(paths)
                existing_audio = soundtrack.get().strip() or None
                window.destroy()
                self._launch('video', output=destination, images=selections, existing_audio=existing_audio, video_settings=video_settings)

            ttk.Button(panel, text='Export audiobook video…', command=start, style='Accent.TButton').pack(anchor='e', pady=(15, 0))

        def gutenberg_mode(self):
            window, panel = self._dialog('Gutenberg Mode — One-click ebook cleanup', 760, 590, padding=12)
            ttk.Label(panel, text='GUTENBERG MODE', style='Title.TLabel').pack(anchor='w')
            ttk.Label(panel, text='Removes Gutenberg header/footer, contents pages, placeholders and page-number artifacts. Source files are not changed.', style='Muted.TLabel', wraplength=700).pack(anchor='w', pady=(4,12))
            toc = tk.BooleanVar(value=True)
            placeholders = tk.BooleanVar(value=True)
            pages = tk.BooleanVar(value=True)
            reflow = tk.BooleanVar(value=True)
            toggles = ttk.Frame(panel)
            toggles.pack(fill='x')
            for label, var in [('Remove table of contents',toc), ('Remove image placeholders',placeholders), ('Remove page numbers',pages), ('Repair wrapped paragraphs',reflow)]:
                ttk.Checkbutton(toggles, text=label, variable=var).pack(anchor='w', pady=2)
            summary = tk.StringVar(value='Select an action below.')
            ttk.Label(panel, textvariable=summary).pack(anchor='w', pady=12)
            text_preview = tk.Text(panel, bg=self.FIELD, fg=self.FG, wrap='word', height=12, font=('Segoe UI', 10))
            text_preview.pack(fill='both', expand=True)

            def clean(text):
                return clean_gutenberg(text, GutenbergOptions(remove_toc=toc.get(), remove_image_placeholders=placeholders.get(), remove_page_numbers=pages.get(), reflow_paragraphs=reflow.get()))

            def preview():
                report = clean(self._get_text())
                text_preview.delete('1.0','end')
                text_preview.insert('1.0', report.content[:16000])
                summary.set(f'{report.chapter_count} chapters · header {"removed" if report.removed_header else "not found"} · footer {"removed" if report.removed_footer else "not found"} · {report.removed_placeholders} placeholders removed')
                return report

            def apply_to_editor():
                report = preview()
                if not report.content:
                    messagebox.showwarning('Gutenberg Mode', 'No content remains after cleanup.', parent=window)
                    return
                self._replace_text(report.content)
                self.status_var.set('Gutenberg Mode applied to editor')

            def bulk():
                docs = filedialog.askopenfilenames(parent=window, title='Select ebook files in bulk', filetypes=[('Ebooks', '*.txt *.md *.epub *.docx *.html *.htm *.pdf *.rtf')])
                if not docs:
                    return
                output = filedialog.askdirectory(parent=window, title='Output directory for cleaned books')
                if not output:
                    return
                def task():
                    errors=[]
                    for n, file in enumerate(docs, 1):
                        try:
                            report=clean(read_document(file))
                            dest=Path(output)/(Path(file).stem+'-cleaned.txt')
                            dest.write_text(report.content, encoding='utf-8')
                            self.events.put(('progress', n, len(docs)))
                        except Exception as exc:
                            errors.append(f'{Path(file).name}: {exc}')
                    self.events.put(('error' if errors else 'done', '\n'.join(errors[:8]) if errors else f'Gutenberg Mode: cleaned {len(docs)} ebooks in {output}'))
                summary.set(f'Processing {len(docs)} ebooks…')
                threading.Thread(target=task, daemon=True).start()

            row=ttk.Frame(panel)
            row.pack(fill='x', pady=(12,0))
            for label, action in [('Preview editor', preview), ('Clean editor in one click', apply_to_editor), ('Bulk clean ebook files…', bulk)]:
                ttk.Button(row, text=label, command=action).pack(side='left', padx=(0,8))
            preview()

        def book_studio(self):
            if self.active:
                messagebox.showinfo(APP_NAME, 'A job is running. Finish or stop it first.')
                return
            window, panel = self._dialog(f'{APP_NAME} — Combine Chapters into Audiobooks', 1060, 730, min_width=570, min_height=400, padding=10)
            ttk.Label(panel,text='COMBINE CHAPTERS INTO AUDIOBOOKS',style='Title.TLabel').pack(anchor='w')
            book_hint=ttk.Label(panel,text='Import books and chapters; optionally match each chapter to a cover image. Export audio-only or video audiobooks, complete books or individual chapters.',style='Muted.TLabel',wraplength=540)
            book_hint.pack(anchor='w',pady=(4,8))
            panel.bind('<Configure>',lambda event:book_hint.configure(wraplength=max(180,event.width-30)),add='+')
            ttk.Label(panel, text='Naming tip: Chapter 01.txt + Chapter 01.png, Chapter 02.txt + Chapter 02.jpg in the same book folder.', style='Muted.TLabel').pack(anchor='w', pady=(0, 5))
            ttk.Button(panel, text='How should I name my books, chapters and covers?', command=self.naming_help).pack(anchor='w', pady=(0, 8))
            books: list[Book] = self.books
            import_queue = queue.Queue()
            row=ttk.Frame(panel)
            row.pack(fill='x',pady=8)
            table_frame=ttk.Frame(panel)
            table_frame.pack(fill='both',expand=True)
            tree=ttk.Treeview(table_frame, columns=('book','chapter','text','cover','audio'), show='headings',selectmode='browse',height=9,style='Book.Treeview')
            for key,name,width in [('book','Book',170),('chapter','Chapter',160),('text','Text file / extracted',250),('cover','Cover image',270),('audio','Recorded narration',170)]:
                tree.heading(key,text=name)
                tree.column(key,width=width,minwidth=75)
            tree.pack(side='top',fill='both',expand=True)
            xbar=ttk.Scrollbar(table_frame,orient='horizontal',command=tree.xview)
            tree.configure(xscrollcommand=xbar.set)
            xbar.pack(side='bottom',fill='x')
            mapping={}
            hint=tk.StringVar(value='Add a book folder or a manifest to begin. Books are queued in the order shown.')
            ttk.Label(panel,textvariable=hint,style='Muted.TLabel',wraplength=960).pack(anchor='w',pady=(6,4))

            def update():
                if not tree.winfo_exists():
                    return
                tree.delete(*tree.get_children())
                mapping.clear()
                for bi,book in enumerate(books):
                    for ci,ch in enumerate(book.chapters):
                        ref=tree.insert('','end',values=(book.title,ch.title,str(ch.text_file) if ch.text_file else ('Embedded text' if ch.text else ''),', '.join(p.name for p in ch.images) or 'MISSING',ch.audio.name if ch.audio else 'Synthesize'))
                        mapping[ref]=(bi,ci)
                hint.set(f'{len(books)} books · {sum(len(b.chapters) for b in books)} chapters · {sum(not c.images for b in books for c in b.chapters)} missing cover matches. Select a chapter to set/replace its cover.')

            def poll_imports():
                if not window.winfo_exists():
                    return
                try:
                    while True:
                        incoming, errors = import_queue.get_nowait()
                        books.extend(incoming)
                        update()
                        if errors:
                            messagebox.showwarning('Book import', '\n'.join(errors[:10]), parent=window)
                except queue.Empty:
                    pass
                window.after(120, poll_imports)

            def import_folder():
                root=filedialog.askdirectory(parent=window,title='Select library folder containing separate book folders, or a single book folder')
                if root:
                    hint.set('Scanning book folders and covers…')
                    def work():
                        try:
                            import_queue.put((discover_books(root),[]))
                        except Exception as exc:
                            import_queue.put(([],[str(exc)]))
                    threading.Thread(target=work,daemon=True).start()

            def import_manifest():
                file=filedialog.askopenfilename(parent=window,title='Select Openmukti book manifest',filetypes=[('Openmukti JSON manifest','*.json')])
                if file:
                    try:
                        books.extend(load_manifest(file))
                        update()
                    except Exception as exc:
                        messagebox.showerror('Import manifest',str(exc),parent=window)

            def import_files():
                paths=filedialog.askopenfilenames(parent=window,title='Select many whole ebooks',filetypes=[('Ebook files and scan archives','*.txt *.md *.epub *.docx *.html *.htm *.pdf *.rtf *.zip *.cbz *.png *.jpg *.jpeg *.tif *.tiff *.bmp *.webp')])
                if not paths:
                    return
                hint.set(f'Importing {len(paths)} ebook files…')
                def work():
                    incoming=[]
                    errors=[]
                    for path in paths:
                        file=Path(path)
                        try:
                            covers=_files(file.parent,{'.png','.jpg','.jpeg','.webp','.bmp','.tif','.tiff'})
                            match=_match_cover(file.stem,covers)
                            chapters=_split_ebook(file,match,gutenberg=False)
                            incoming.append(Book(file.stem,chapters))
                        except Exception as exc:
                            errors.append(f'{file.name}: {exc}')
                    import_queue.put((incoming,errors))
                threading.Thread(target=work,daemon=True).start()

            def set_cover():
                selected=tree.selection()
                if not selected:
                    return
                bi,ci=mapping[selected[0]]
                files=filedialog.askopenfilenames(parent=window,title='Choose image(s) for this chapter',filetypes=[('Images','*.png *.jpg *.jpeg *.webp *.bmp *.tif *.tiff')])
                if files:
                    books[bi].chapters[ci].images=[Path(file) for file in files]
                    update()

            def remove_book():
                selected=tree.selection()
                if selected:
                    bi,_=mapping[selected[0]]
                    books.pop(bi)
                    update()

            def review_chapter():
                selected=tree.selection()
                if selected:
                    bi,ci=mapping[selected[0]]
                    show_chapter_review(self,books[bi].chapters[ci],update)

            tree.bind('<Double-1>',lambda _event:review_chapter())
            adaptive_grid(row,[('Add folder of books',import_folder),('Add many ebooks',import_files),('Import JSON manifest',import_manifest),('Review chapter OCR / spelling',review_chapter),('Assign selected chapter cover',set_cover),('Remove selected book',remove_book)],columns=2)
            settings_row=ttk.Frame(panel)
            settings_row.pack(fill='x',pady=(12,8))
            stored=self.book_export_settings
            mode=tk.StringVar(value=stored.get('mode','both'))
            aspect=tk.StringVar(value=stored.get('aspect','16:9'))
            res=tk.StringVar(value=stored.get('resolution','720p'))
            kind=tk.StringVar(value=stored.get('video_format','mp4'))
            output_type=tk.StringVar(value=stored.get('output_type','video'))
            audio_fmt=tk.StringVar(value=stored.get('audio_format','mp3'))
            characters=self.use_character_voices_var
            gutenberg=tk.BooleanVar(value=GUTENBERG_ENABLED)
            skip=tk.BooleanVar(value=stored.get('skip_existing',False))
            for column in range(2):
                settings_row.columnconfigure(column, weight=1)
            for index,(title,var,values) in enumerate([('Export',mode,['both','book','chapters']),('Output',output_type,['video','audio']),('Aspect',aspect,list(ASPECTS)),('Video format',kind,['mp4','mkv','mov','webm']),('Audio format',audio_fmt,['wav','mp3','m4a','flac','ogg'])]):
                group=ttk.Frame(settings_row)
                group.grid(row=index//2,column=index%2,sticky='ew',padx=(0,8),pady=3)
                ttk.Label(group,text=title).pack(anchor='w')
                ttk.Combobox(group,textvariable=var,values=values,width=12,state='readonly').pack(fill='x')
            if GUTENBERG_ENABLED:
                ttk.Checkbutton(settings_row,text='Gutenberg Mode',variable=gutenberg).grid(row=3,column=0,sticky='w')
            ttk.Checkbutton(settings_row,text='Skip existing files',variable=skip).grid(row=3,column=1,sticky='w')

            ttk.Checkbutton(panel,text='Use my Character Voice Studio profiles (tag narrator/characters inside each chapter)',variable=characters).pack(anchor='w',pady=4)
            ttk.Button(panel,text='Edit character profiles',command=self.character_voice_studio).pack(anchor='w',pady=4)
            def remember_book_settings(*_args):
                self.book_export_settings={'mode':mode.get(),'aspect':aspect.get(),'resolution':res.get(),'video_format':kind.get(),
                    'output_type':output_type.get(),'audio_format':audio_fmt.get(),'skip_existing':skip.get()}
            for v in (mode,aspect,res,kind,output_type,audio_fmt,skip):
                v.trace_add('write',remember_book_settings)
            remember_book_settings()

            def start():
                if getattr(self, '_chapter_spelling', []):
                    messagebox.showinfo('Chapter review','Save or close the chapter review editor before exporting books.',parent=window)
                    return
                if not books:
                    messagebox.showwarning('Combine Chapters','Add books or chapters first.',parent=window)
                    return
                missing=[f'{b.title}: {c.title}' for b in books for c in b.chapters if not c.images] if output_type.get()=='video' else []
                if missing:
                    messagebox.showerror('Missing chapter covers','Assign images to these chapters before exporting:\n'+'\n'.join(missing[:12]),parent=window)
                    return
                dest=filedialog.askdirectory(parent=window,title='Choose audiobook output folder')
                if not dest:
                    return
                try:
                    engine_name,speech_settings,speech_opts=self._params()
                    need_voice=any(not ch.audio for book in books for ch in book.chapters)
                    engine=get_engine(engine_name,speech_settings.model) if need_voice else None
                except Exception as exc:
                    messagebox.showerror('Voice setup',str(exc),parent=window)
                    return
                opts=BookExportOptions(mode=mode.get(),video=VideoOptions(aspect=aspect.get(),resolution=res.get()),gutenberg=gutenberg.get(),skip_existing=skip.get(),video_format=kind.get(),audio_format=audio_fmt.get(),output_type=output_type.get())
                voice_project=self._effective_project() if characters.get() else None
                all_books=list(books)
                self.active=True
                self.control=RunControl()
                self._set_buttons()
                window.destroy()
                self.status_var.set(f'Rendering {len(all_books)} book(s)…')
                def task():
                    try:
                        result=export_books(all_books,dest,engine=engine,settings=speech_settings,speech_options=speech_opts,options=opts,voice_project=voice_project,control=self.control,progress=lambda n,total,title:self.events.put(('progress',n,total)))
                        failures=result['failures']
                        if failures:
                            self.events.put(('error', f'Completed with {len(failures)} failures. See openvoice-batch-report.json in {dest}.\n'+str(failures[:3])))
                        else:
                            self.events.put(('done',f'Audiobook Creator: {len(result["books"])} books and {len(result["outputs"])} files exported to {dest}'))
                    except Exception as exc:
                        self.events.put(('error',str(exc)))
                    finally:
                        self.events.put(('idle',))
                threading.Thread(target=task,daemon=True).start()

            ttk.Button(panel,text='▶  One-click export all books',command=start,style='Accent.TButton').pack(anchor='e',pady=(8,0))
            poll_imports()

        def _set_buttons(self):
            state = 'disabled' if self.active else 'normal'
            for btn in (self.speak_btn, self.export_btn, self.batch_btn, self.video_btn):
                btn.configure(state=state)
            for btn in (self.pause_btn, self.stop_btn):
                btn.configure(state='normal' if self.active else 'disabled')

        def speak(self):
            self._launch('speak')

        def export(self):
            path = filedialog.asksaveasfilename(defaultextension='.wav', initialfile='speech.wav', filetypes=[('WAV', '*.wav'), ('MP3 (FFmpeg)', '*.mp3'), ('FLAC (FFmpeg)', '*.flac'), ('OGG (FFmpeg)', '*.ogg'), ('M4A (FFmpeg)', '*.m4a'), ('Opus (FFmpeg)', '*.opus'), ('AAC (FFmpeg)', '*.aac'), ('AIFF (FFmpeg)', '*.aiff')])
            if path:
                self._launch('export', output=path)

        def batch(self):
            files = filedialog.askopenfilenames(title='Select documents to convert')
            if not files:
                return
            output = filedialog.askdirectory(title='Choose output folder')
            if output:
                fmt = simpledialog.askstring('Batch format', 'Format: wav, mp3, flac, ogg, m4a', initialvalue='wav', parent=self.root)
                if fmt and fmt.lower() in ('wav', 'mp3', 'flac', 'ogg', 'm4a'):
                    self._launch('batch', output=output, files=files, audio_format=fmt.lower())
                elif fmt:
                    messagebox.showerror('Batch format', 'Unsupported format')

        def pause(self):
            if self.control:
                if self.control.resumed.is_set():
                    self.control.pause()
                    self.pause_var.set('Resume')
                    self.status_var.set('Pausing after the current text chunk…')
                else:
                    self.control.resume()
                    self.pause_var.set('Pause between sentences')
                    self.status_var.set('Resuming…')

        def stop(self):
            if self.control:
                self.control.stop()
                self.status_var.set('Stopping…')

        def poll(self):
            try:
                while True:
                    event = self.events.get_nowait()
                    kind = event[0]
                    if kind == 'progress':
                        self.progress['value'] = round(event[1] / event[2] * 100) if event[2] else 0
                        self.status_var.set(f'Processed {event[1]} of {event[2]} chunks/files')
                    elif kind == 'done':
                        self.progress['value'] = 100
                        self.status_var.set(event[1])
                    elif kind == 'error':
                        self.status_var.set(f'Error: {event[1][:140]}')
                        messagebox.showerror(APP_NAME, event[1])
                    elif kind == 'idle':
                        self.active = False
                        self.control = None
                        self._set_buttons()
                    elif kind == 'ui':
                        event[1]()
                    elif kind == 'voices':
                        _engine_key, names = (event[1], event[2])
                        self.voice_combo.configure(values=[''] + names)
                        if self.voice_var.get() and self.voice_var.get() not in names:
                            self.voice_var.set('')
                        self.status_var.set(f'{_engine_key}: {len(names)} available voices' if names else f'{_engine_key}: select or install a voice/model')
                    elif kind == 'piper_installed':
                        self.model_var.set('')
                        self.engine_var.set('piper')
                        self.voice_var.set(event[1])
                        self.status_var.set(f'Piper voice installed: {event[1]}')
                        if not self.engines['piper'].available():
                            messagebox.showinfo('Piper engine required', 'Your voice files have been added. Install the Piper TTS executable and restart the app to use this voice. See Help → Set Up Piper Voices.')
                        self.refresh_voices()
                    elif kind == 'error_voices':
                        self.status_var.set(f'Unable to list voices: {event[1]}')
            except queue.Empty:
                pass
            self.root.after(100, self.poll)

        def close(self):
            if self._ocr_cancel:
                self._ocr_cancel.set()
            self.spelling.close()
            for controller in getattr(self, '_chapter_spelling', []):
                controller.close()
            if self.control:
                self.control.stop()
            self.root.destroy()
            if self._project_workspace is not None:
                self._project_workspace.cleanup()
    try:
        root = tk.Tk()
    except tk.TclError as exc:
        print(f'Cannot open GUI (is a desktop display available?): {exc}')
        return 1
    app = App(root)
    app._set_buttons()
    root.mainloop()
    return 0
if __name__ == '__main__':
    raise SystemExit(main())
