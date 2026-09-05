if (!customElements.get('dije-upsell-picker')) {
  customElements.define(
    'dije-upsell-picker',
    class DijeUpsellPicker extends HTMLElement {
      connectedCallback() {
        this.cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        this.actionPanel = this.querySelector('.dije-upsell__action');
        this.actionTitle = this.querySelector('.dije-upsell__action-title');
        this.variantsEl = this.querySelector('.dije-upsell__variants');
        this.addButton = this.querySelector('.dije-upsell__add-button');
        this.addButtonText = this.querySelector('.dije-upsell__add-button-text');
        this.spinner = this.addButton?.querySelector('.loading__spinner');
        this.errorEl = this.querySelector('.dije-upsell__error');
        this.track = this.querySelector('.dije-upsell__track');
        this.selectedProduct = null;
        this.selectedVariantId = null;
        this.dragState = { active: false, moved: false, startX: 0, scrollLeft: 0 };

        this.initDragScroll();
        this.addEventListener('click', this.onPickerClick.bind(this));
        this.addButton?.addEventListener('click', this.onAddToCart.bind(this));
      }

      initDragScroll() {
        if (!this.track) return;

        this.track.addEventListener(
          'pointerdown',
          (event) => {
            if (event.target.closest('.dije-upsell-card__select')) return;
            if (event.pointerType === 'mouse' && event.button !== 0) return;

            this.dragState.active = true;
            this.dragState.moved = false;
            this.dragState.startX = event.clientX;
            this.dragState.scrollLeft = this.track.scrollLeft;
            this.track.classList.add('is-dragging');
          },
          { passive: true }
        );

        this.track.addEventListener(
          'pointermove',
          (event) => {
            if (!this.dragState.active) return;

            const deltaX = event.clientX - this.dragState.startX;
            if (Math.abs(deltaX) > 6) this.dragState.moved = true;
            if (!this.dragState.moved) return;

            event.preventDefault();
            this.track.scrollLeft = this.dragState.scrollLeft - deltaX;
          },
          { passive: false }
        );

        const endDrag = () => {
          if (!this.dragState.active) return;
          this.dragState.active = false;
          this.track.classList.remove('is-dragging');
          window.setTimeout(() => {
            this.dragState.moved = false;
          }, 50);
        };

        this.track.addEventListener('pointerup', endDrag);
        this.track.addEventListener('pointercancel', endDrag);
        this.track.addEventListener('pointerleave', endDrag);
      }

      onPickerClick(event) {
        const selectButton = event.target.closest('.dije-upsell-card__select');
        if (!selectButton || !this.contains(selectButton)) return;

        if (this.dragState.moved) {
          event.preventDefault();
          return;
        }

        const card = selectButton.closest('.dije-upsell-card');
        if (!card) return;

        let data;
        try {
          data = {
            id: Number(card.dataset.productId),
            title: card.dataset.productTitle,
            variants: JSON.parse(card.dataset.variants || '[]'),
          };
        } catch (error) {
          console.error('dije-upsell: invalid variant data', error);
          return;
        }

        this.querySelectorAll('.dije-upsell-card').forEach((item) => item.classList.remove('is-selected'));
        this.querySelectorAll('.dije-upsell-card__select').forEach((button) => {
          button.setAttribute('aria-pressed', 'false');
        });

        card.classList.add('is-selected');
        selectButton.setAttribute('aria-pressed', 'true');

        this.selectedProduct = data;
        this.renderActionPanel(data);
        this.showActionPanel();
      }

      showActionPanel() {
        if (!this.actionPanel) return;
        this.actionPanel.removeAttribute('hidden');
        this.actionPanel.classList.add('is-visible');
        this.actionPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        if (this.errorEl) this.errorEl.hidden = true;
      }

      renderActionPanel(data) {
        if (!this.actionPanel) return;

        this.actionTitle.textContent = data.title;
        this.variantsEl.innerHTML = '';

        const firstAvailable = data.variants.find((variant) => variant.available);
        const fallbackVariant = data.variants[0];
        this.selectedVariantId = (firstAvailable || fallbackVariant)?.id || null;

        if (data.variants.length > 1) {
          const fieldset = document.createElement('fieldset');
          fieldset.className = 'dije-upsell__variants-fieldset';
          fieldset.setAttribute('aria-label', data.title);

          data.variants.forEach((variant) => {
            const label = document.createElement('label');
            label.className = 'dije-upsell__variant-option';

            const input = document.createElement('input');
            input.type = 'radio';
            input.name = `dije-variant-${data.id}`;
            input.value = variant.id;
            input.checked = variant.id === this.selectedVariantId;
            input.disabled = !variant.available;
            input.addEventListener('change', () => {
              this.selectedVariantId = Number(input.value);
              this.updateAddButton();
            });

            const text = document.createElement('span');
            text.textContent = variant.title;

            label.append(input, text);
            fieldset.appendChild(label);
          });

          this.variantsEl.appendChild(fieldset);
        }

        this.updateAddButton();
      }

      updateAddButton() {
        if (!this.addButton || !this.selectedProduct) return;

        const variant = this.selectedProduct.variants.find((item) => item.id === this.selectedVariantId);
        const available = Boolean(variant?.available);

        this.addButton.disabled = !available;
        if (this.addButtonText) {
          this.addButtonText.textContent = available
            ? this.addButton.dataset.addLabel
            : this.addButton.dataset.soldOutLabel;
        }
      }

      onAddToCart(event) {
        event.preventDefault();
        event.stopPropagation();

        if (!this.selectedVariantId || this.addButton.disabled) return;

        if (this.errorEl) this.errorEl.hidden = true;

        this.addButton.setAttribute('aria-disabled', 'true');
        this.addButton.classList.add('loading');
        this.spinner?.classList.remove('hidden');

        const config = fetchConfig('javascript');
        config.headers['X-Requested-With'] = 'XMLHttpRequest';
        delete config.headers['Content-Type'];

        const formData = new FormData();
        formData.append('id', this.selectedVariantId);
        formData.append('quantity', 1);

        if (this.cart) {
          formData.append(
            'sections',
            this.cart.getSectionsToRender().map((section) => section.id)
          );
          formData.append('sections_url', window.location.pathname);
          this.cart.setActiveElement(document.activeElement);
        }

        config.body = formData;

        fetch(`${routes.cart_add_url}`, config)
          .then((response) => response.json())
          .then((response) => {
            if (response.status) {
              const message = response.description || response.message;
              if (this.errorEl) {
                this.errorEl.textContent = message;
                this.errorEl.hidden = false;
              }
              publish(PUB_SUB_EVENTS.cartError, {
                source: 'dije-upsell',
                productVariantId: this.selectedVariantId,
                errors: response.errors || response.description,
                message: response.message,
              });
              return;
            }

            if (!this.cart) {
              window.location = window.routes.cart_url;
              return;
            }

            publish(PUB_SUB_EVENTS.cartUpdate, {
              source: 'dije-upsell',
              productVariantId: this.selectedVariantId,
              cartData: response,
            }).then(() => {
              this.cart.renderContents(response);
            });
          })
          .catch((error) => {
            console.error(error);
            if (this.errorEl) {
              this.errorEl.textContent = 'No se pudo añadir el dije. Intenta de nuevo.';
              this.errorEl.hidden = false;
            }
          })
          .finally(() => {
            this.addButton.classList.remove('loading');
            this.spinner?.classList.add('hidden');
            this.addButton.removeAttribute('aria-disabled');
          });
      }
    }
  );
}
