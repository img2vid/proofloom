from __future__ import annotations
import tkinter as tk
from openvoice import windowing

root = tk.Tk()
windowing.fit_window(root, 1100, 730, 600, 410)
root.update()
assert root.winfo_width() <= root.winfo_screenwidth()

original = windowing.work_area
windowing.work_area = lambda _: windowing.WorkArea(0, 0, 700, 450)
windowing.keep_window_visible(root)
root.update()
assert root.winfo_width() <= 700, (root.winfo_width(), root.geometry())
assert root.winfo_height() <= 450, (root.winfo_height(), root.geometry())
assert root.winfo_x() >= 0 and root.winfo_y() >= 0

windowing.work_area = lambda _: windowing.WorkArea(100, 30, 470, 300)
windowing.keep_window_visible(root)
root.update()
assert root.winfo_width() <= 470 and root.winfo_height() <= 300, root.geometry()
root.destroy()
print('Live resize fit succeeded')
