;;; livemirror.el ---
;; LiveCoding System for Emacs
;; Copyright (C) 2016 by sylx
;; Author: sylx <sylx@oyabanare.com>
;; Version: 1.0.0
;; Package-Requires: ((websocket "1.6") (emacs "24"))
;; URL: https://github.com/sylx/
;;; Commentary:
;;; Code:

(eval-when-compile
  (require 'cl))

(require 'websocket)
(require 'json)

(defgroup livemirror nil
  "LiveCoding System for Emacs"
  :group 'text
  :prefix "livemirror-")

(defcustom livemirror-server "localhost:11072"
  "Livemirror server hostname:port"
  :type 'string
  :group 'livemirror)

(defcustom livemirror-channel "general"
  "Livemirror server channel [a-z0-9]+"
  :type 'string
  :group 'livemirror)

(defvar livemirror-websocket nil)
(defvar livemirror-current-buffer-name nil)
(defvar livemirror-current-buffer-tick nil)
(defvar livemirror-already-sent nil)
(defvar livemirror-idle-timer nil)
(defvar livemirror-global nil)


(defun livemirror-start ()
  (interactive)
  (livemirror-init-websocket)
  (livemirror-add-hooks)
  (setq livemirror-global t)
  )
(defun livemirror-stop ()
  (interactive)
  (livemirror-disconnect)
  (livemirror-remove-hooks)
  (setq livemirror-global nil)
)

(defun livemirror-init-websocket ()
  (lexical-let ((url (format "ws://%s/%s/master" livemirror-server livemirror-channel))
                (cb '(lambda()
                       (livemirror-emit-buffer)
                       ))
                )
    (if (and livemirror-websocket (eq (websocket-ready-state livemirror-websocket) 'open))
        (funcall cb)
      (if livemirror-websocket
          (websocket-close livemirror-websocket))
      (message "Connect to %s" url)
      (setq livemirror-websocket
            (websocket-open
             url
             :on-open  (lambda (websocket)
                         (message "open stream")
                         (funcall cb)
                         )
             :on-message (lambda (websocket frame)
                           (message "%s" (websocket-frame-payload frame)))
             :on-error (lambda (ws type err)
                         (livemirror-on-socket-error cb)
                         )
             :on-close (lambda (websocket)
                         (livemirror-remove-hooks)
                         (message "closed connection")
                         (setq livemirror-websocket nil)
                         ))))))

(defun livemirror-disconnect ()
  (if (and livemirror-websocket (eq (websocket-ready-state livemirror-websocket) 'open))
      (websocket-close livemirror-websocket)
    (setq livemirror-websocket nil))
  )



;; handlers
(defun livemirror-on-socket-error (cb)
  (message "error connecting server")
  (livemirror-remove-hooks)
  (setq livemirror-global nil)
)

(defun livemirror-on-idle ()
  (when livemirror-global
    ;;switch-buffer
    (when (not (eq livemirror-current-buffer-name (buffer-name)))
      (setq livemirror-current-buffer-name (buffer-name))
      (livemirror-emit-buffer)

      ;;workaround
      (remove-hook 'post-command-hook 'livemirror-on-command t)
      (add-hook 'post-command-hook 'livemirror-on-command nil t)

      (setq livemirror-already-sent t))
    ;;change buffer
    (if (and 
         (not livemirror-already-sent)
         (not (eq (buffer-modified-tick) livemirror-current-buffer-tick)))
        (livemirror-emit-buffer))
    ))

(defun livemirror-on-command ()
  (when livemirror-global
    ;;change region
    (if (and transient-mark-mode mark-active)
        (livemirror-emit-region (region-beginning) (region-end))
      (livemirror-emit-cursor))))


(defun livemirror-on-change (&optional bgn end lng)
  (when livemirror-global
    (livemirror-emit-change bgn end lng)
    (setq livemirror-already-sent t)
    ))


(defun livemirror-add-hooks ()
  (setq livemirror-idle-timer (run-with-idle-timer 1 t 'livemirror-on-idle))
  (add-hook 'post-command-hook 'livemirror-on-command nil t)
  (add-hook 'after-change-functions 'livemirror-on-change nil t)
  )

(defun livemirror-remove-hooks ()
  (when livemirror-idle-timer
    (cancel-timer livemirror-idle-timer)
    (setq livemirror-idle-timer nil))
  (remove-hook 'post-command-hook 'livemirror-on-command t)
  (remove-hook 'after-change-functions 'livemirror-on-change t))


;; emitters
(defun livemirror-send-data (data)
  (if (and livemirror-websocket (eq (websocket-ready-state livemirror-websocket) 'open))
      (websocket-send-text livemirror-websocket (json-encode data))
    (message "no send.")))

(defun livemirror-emit-buffer ()
  (interactive)
  (let (
        (text (buffer-substring-no-properties (point-min) (point-max)))
        (data (make-hash-table :test #'equal))
        )
    (puthash "type" "buffer" data)
    (puthash "mode" major-mode data)
    (puthash "name" (buffer-name) data)
    (puthash "length" (length text) data)
;    (puthash "filename" (buffer-file-name) data)
    (livemirror-send-data data)
    (livemirror-send-chunk (buffer-name) text)
    ))

(defun livemirror-send-chunk (bufname text)
  (let (
        (len (length text))
        (index 0)
        (lenbuf 4096)
        (epos 0)
        (data (make-hash-table :test #'equal))
        )
    (puthash "type" "chunk" data)
    (puthash "name" bufname data)
    (while (< index len)
      (setq epos (+ index lenbuf))
      (if (> epos len)
          (setq epos len))
      (puthash "pos" index data)
      (puthash "text" (substring text index epos) data)
      (livemirror-send-data data)
      (setq index (+ index lenbuf))
      )
    (puthash "text" "" data)
    (livemirror-send-data data)
    ))

(defun livemirror-gethash-point (pos)
      (let (
            (pdata (make-hash-table :test #'equal))
            )
        (save-excursion
          (goto-char pos)
          (puthash "pos" pos pdata)
          (puthash "line" (- (line-number-at-pos) 1) pdata)
          (move-beginning-of-line nil)
          (puthash "col" (- pos (point)) pdata)
          )
        pdata
        ))


(defun livemirror-emit-change (bgn end lng)
    (lexical-let (
          (bgn2 nil)
          (end2 nil)
          (data (make-hash-table :test #'equal))
          (mode 'overwrite)
          )
      (cond ((< (abs (- end bgn)) lng)
             (setq mode 'delete))
            ((> (abs (- end bgn)) lng)
             (setq mode 'insert)))

      (save-excursion (goto-char bgn)
                      (move-beginning-of-line nil)
                      (setq bgn2 (point)))
      (save-excursion (goto-char end)
                      (move-end-of-line nil)
                      (setq end2 (point)))

      (puthash "type" "change" data)
      (puthash "begin" (livemirror-gethash-point bgn) data)
      (puthash "end" (livemirror-gethash-point end) data)
      (puthash "mode" mode data)
      (puthash "lng" lng data)
      (puthash "mtext" (buffer-substring-no-properties bgn end) data)
      (puthash "ltext" (buffer-substring-no-properties bgn2 end2) data)
      (run-with-timer 0 nil (lambda () (livemirror-send-data data)))))

(defun livemirror-emit-cursor ()
  (lexical-let (
        (data (make-hash-table :test #'equal))
        )
      (puthash "type" "cursor" data)
      (puthash "cursor" (livemirror-gethash-point (point)) data)
      (run-with-timer 0 nil (lambda () (livemirror-send-data data)))
      ))

(defun livemirror-emit-region (s e)
  (interactive "r")
  (lexical-let (
        (data (make-hash-table :test #'equal))
        )
    (puthash "type" "selection" data)
    (puthash "begin" (livemirror-gethash-point s) data)
    (puthash "end" (livemirror-gethash-point e) data)
    (run-with-timer 0 nil (lambda () (livemirror-send-data data)))))

(defun livemirror-emit-reload ()
  (interactive)
  (let (
        (data (make-hash-table :test #'equal))
        )
    (puthash "type" "reload" data)
    (livemirror-send-data data)))

(provide 'livemirror)

;;; livemirror.el ends here
