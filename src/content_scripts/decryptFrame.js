/**
 * Mailvelope - secure email with OpenPGP encryption for Webmail
 * Copyright (C) 2012  Thomas Oberndörfer
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License version 3
 * as published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var DecryptFrame = DecryptFrame || (function() { 

  var decryptFrame = function (){
    this.id = ++DecryptFrame.prototype.id;
    // text node with Armor Tail Line '-----END PGP...'
    this._pgpEnd;
    // parent node of _pgpEnd 
    this._pgpParent;
    // node that contains complete ASCII Armored Message
    this._pgpElement;
    this._pgpElementAttr = {};
    // type of message: message, signed, public key...
    this._pgpMessageType;
    this._dFrame;
    this._dDialog;
    this._port;
    this._refreshPosIntervalID;
  }

  decryptFrame.prototype = {

    constructor: DecryptFrame,

    id: 0,

    attachTo: function(pgpEnd, tabid) {
      this.id = tabid + '_' + this.id;
      this._init(pgpEnd);
      this._getMessageType();
      // currently only this type supported
      if (this._pgpMessageType === constant.PGP_MESSAGE) {
        this._renderFrame();
        this._establishConnection();
        this._registerEventListener();
      }
      // set status to attached
      this._pgpEnd.data(constant.FRAME_STATUS, constant.FRAME_ATTACHED);
      //this._pgpEnd.get(0)[constant.FRAME_STATUS] = constant.FRAME_ATTACHED;
      // store frame obj in pgpText tag
      this._pgpEnd.data(constant.FRAME_OBJ, this);
    },
  
    _init: function(pgpEnd) {
      this._pgpEnd = pgpEnd;
      this._pgpParent = this._pgpEnd.parent();
      
      var regex = /BEGIN\sPGP/;
      this._pgpElement = this._pgpParent;
      while (!regex.test(this._pgpElement.text())) {
        this._pgpElement = this._pgpElement.parent(); 
      }
      this._pgpElementAttr.marginTop = parseInt(this._pgpElement.css('margin-top'), 10);
    },

    _getMessageType: function() {
      var armored = this._pgpElement.text();
      if (/BEGIN\sPGP\sMESSAGE/.test(armored)) {
        this._pgpMessageType = constant.PGP_MESSAGE;
      } else if (/BEGIN\sPGP\sSIGNATURE/.test(armored)) {
        this._pgpMessageType = constant.PGP_SIGNATURE;
      } else if (/BEGIN\sPGP\sPUBLIC\sKEY\sBLOCK/.test(armored)) {
        this._pgpMessageType = constant.PGP_PUBLIC_KEY;
      } else if (/BEGIN\sPGP\sPRIVATE\sKEY\sBLOCK/.test(armored)) {
        this._pgpMessageType = constant.PGP_PRIVATE_KEY;
      }
    },
    
    _renderFrame: function() {
      var that = this;
      this._dFrame = $('<div/>', {
        id: 'dFrame' + that.id,
        'class': 'g-frame',
        html: '<a class="g-frame-close">×</a>'
      });
      
      this._setFrameDim();
      
      this._dFrame.insertAfter(this._pgpElement);
      this._dFrame.addClass('g-decrypt-key-cursor');
      this._dFrame.fadeIn('slow');
      
      this._dFrame.on('click', this._clickHandler.bind(this));
      this._dFrame.find('.g-frame-close').on('click', this._closeFrame.bind(this));
      
      $(window).resize(this._setFrameDim.bind(this));
      this._refreshPosIntervalID = window.setInterval(this._setFrameDim.bind(this), 1000);
    },
    
    _clickHandler: function() {
      this._dFrame.off('click');
      this._toggleIcon(this._showDialog.bind(this));
      return false;
    },
    
    _closeFrame: function(finalClose) {
      this._dFrame.fadeOut((function() {
        window.clearInterval(this._refreshPosIntervalID);
        $(window).off('resize');
        this._dFrame.remove();
        if (finalClose === true) {
          this._port.disconnect();
          this._pgpEnd.data(constant.FRAME_STATUS, null);
        } else {
          this._pgpEnd.data(constant.FRAME_STATUS, constant.FRAME_DETACHED);
        }
        this._pgpEnd.data(constant.FRAME_OBJ, null);
      }).bind(this));
      return false;
    },
    
    _toggleIcon: function(callback) {
      var that = this;
      var left = 10;
      var center = '50%';
      var centerLeft = Math.round(this._dFrame.width() / 2 - 48);
      var positionx = this._dFrame.css('background-position-x');
      if (positionx === center) {
        this._dFrame.css('background-position-x', centerLeft); 
        this._dFrame.animate({
          'background-position-x': left
        }, callback);
      } else {
        this._dFrame.animate({
          'background-position-x': centerLeft
        }, function() {
          that._dFrame.css('background-position', center);
          if (callback) callback();
        });
        
      }
    },
    
    _setFrameDim: function() {
      var pgpElementPos = this._pgpElement.position();
      this._dFrame.width(this._pgpElement.width() - 2);
      this._dFrame.height(this._pgpParent.position().top + this._pgpParent.height() - pgpElementPos.top - 2);
      this._dFrame.css('top', pgpElementPos.top + this._pgpElementAttr.marginTop);
    },
    
    _showDialog: function() {
      var that = this;
      this._dDialog = $('<iframe/>', {
        id: 'dDialog' + that.id,
        'class': 'g-frame-dialog',
        src: chrome.extension.getURL('views/decryptDialog.html?id=' + that.id),
        frameBorder: 0, 
        scrolling: 'no'
      });
      
      this._dFrame.append(this._dDialog);
      this._setFrameDim();
      this._dFrame.removeClass('g-decrypt-key-cursor');
      this._dDialog.fadeIn();
      
    },
    
    _establishConnection: function() {
      var that = this;
      this._port = chrome.extension.connect({name: 'dFrame-' + that.id});
      //console.log('Port connected: %o', this._port);
    },
    
    _removedDialog: function() {
      this._dDialog.fadeOut();
      // removal triggers disconnect event
      this._dDialog.remove();
      this._dFrame.addClass('g-decrypt-key-cursor');
      this._dDialog = null;
      this._toggleIcon();
      this._dFrame.on('click', this._clickHandler.bind(this));
    },
    
    _getArmoredMessage: function() {
      var msg, msgLines;
      if (this._pgpElement.is(this._pgpParent)) {
        // the parent of the tail line text node is equal to the node that contains the complete armored text
        // => treat armored text as one entity
        msgLines = this._pgpElement;
      } else {
        // nested html structure
        msgLines = this._pgpElement.children();
        // find head
        var head;
        for (var i = 0; i < msgLines.length; i++) {
          if (/BEGIN\sPGP/.test(msgLines.eq(i).text())) {
            head = i;
            break;
          }
        }
        // find tail
        var tail;
        for (var i = head + 1; i < msgLines.length; i++) {
          if (/END\sPGP/.test(msgLines.eq(i).text())) {
            tail = i;
            break;
          }
        } 
        msgLines = msgLines.slice(head, tail + 1);
      }
      // process armored text line by line
      msgLines = msgLines.map(function(index, element) {
        var line = $(element).html();
        line = line.replace(/\n/g, ' '); // replace new line with space
        line = line.replace(/(<br>)/g, '\n'); // replace <br> with new line
        line = line.replace(/<(\/.+?)>/g, '\n'); // replace closing tags </..> with new line
        line = line.replace(/<(.+?)>/g, ''); // remove opening tags
        return line;
      });
      msg = msgLines.get().join('\n');
      msg = msg.replace(/\n\s+/g, '\n'); // compress sequence of whitespace and new line characters to one new line
      msg = msg.replace(/:.*\n(?!.*:)/, '$&\n');  // insert new line after last armor header
      msg = msg.replace(/^\s*/, ''); // remove leading whitespace
      msg = msg.replace(/\s*$/, ''); // remove trailing whitespace

      return msg;
    },
    
    _registerEventListener: function() {
      var that = this;
      this._port.onMessage.addListener(function(msg) {
        //console.log('dFrame-%s event %s received', that.id, msg.event);
        switch (msg.event) {
          case 'decrypt-dialog-cancel':
          that._removedDialog();
          break;
          case 'armored-message':
          that._port.postMessage({
            event: 'dframe-armored-message', 
            data: that._getArmoredMessage(),
            sender: 'dFrame-' + that.id
          });
          break;
          case 'destroy':
          that._closeFrame(true);
          break;
          default:
          console.log('unknown event');
        }
      });
    }
  
  };

  decryptFrame.isAttached = function(element) {
    var status = element.data(constant.FRAME_STATUS);
    //var status = element.get(0)[constant.FRAME_STATUS];
    switch (status) {
      case constant.FRAME_ATTACHED:
      case constant.FRAME_DETACHED:
      return true;
      break;
      default:
      return false;
    }    
  }

  return decryptFrame;

}());
