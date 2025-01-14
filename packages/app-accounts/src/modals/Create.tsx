// Copyright 2017-2019 @polkadot/app-accounts authors & contributors
// This software may be modified and distributed under the terms
// of the Apache-2.0 license. See the LICENSE file for details.

import { I18nProps } from '@polkadot/react-components/types';
import { ActionStatus } from '@polkadot/react-components/Status/types';
import { KeypairType } from '@polkadot/util-crypto/types';
import { ModalProps } from '../types';

import FileSaver from 'file-saver';
import React, { useContext, useState } from 'react';
import styled from 'styled-components';
import { DEV_PHRASE } from '@polkadot/keyring/defaults';
import { ApiContext } from '@polkadot/react-api';
import { AddressRow, Button, Dropdown, Input, InputAddress, Modal, Password } from '@polkadot/react-components';
import keyring from '@polkadot/ui-keyring';
import uiSettings from '@polkadot/ui-settings';
import { isHex, u8aToHex } from '@polkadot/util';
import { keyExtractSuri, mnemonicGenerate, mnemonicValidate, randomAsU8a } from '@polkadot/util-crypto';

import translate from '../translate';
import CreateConfirmation from './CreateConfirmation';

interface Props extends ModalProps, I18nProps {
  seed?: string;
  type?: KeypairType;
}

type SeedType = 'bip' | 'raw' | 'dev';

interface AddressState {
  address: string | null;
  deriveError: string | null;
  derivePath: string;
  isSeedValid: boolean;
  pairType: KeypairType;
  seed: string;
  seedType: SeedType;
}

const DEFAULT_PAIR_TYPE = 'sr25519';

function deriveValidate (seed: string, derivePath: string, pairType: KeypairType): string | null {
  try {
    const { path } = keyExtractSuri(`${seed}${derivePath}`);

    // we don't allow soft for ed25519
    if (pairType === 'ed25519' && path.some(({ isSoft }): boolean => isSoft)) {
      return 'Soft derivation paths are not allowed on ed25519';
    }
  } catch (error) {
    return error.message;
  }

  return null;
}

function isHexSeed (seed: string): boolean {
  return isHex(seed) && seed.length === 66;
}

function rawValidate (seed: string): boolean {
  return ((seed.length > 0) && (seed.length <= 32)) || isHexSeed(seed);
}

function addressFromSeed (phrase: string, derivePath: string, pairType: KeypairType): string {
  return keyring
    .createFromUri(`${phrase.trim()}${derivePath}`, {}, pairType)
    .address;
}

function newSeed (seed: string | undefined | null, seedType: SeedType): string {
  switch (seedType) {
    case 'bip':
      return mnemonicGenerate();
    case 'dev':
      return DEV_PHRASE;
    default:
      return seed || u8aToHex(randomAsU8a());
  }
}

function generateSeed (_seed: string | undefined | null, derivePath: string, seedType: SeedType, pairType: KeypairType = DEFAULT_PAIR_TYPE): AddressState {
  const seed = newSeed(_seed, seedType);
  const address = addressFromSeed(seed, derivePath, pairType);

  return {
    address,
    deriveError: null,
    derivePath,
    isSeedValid: true,
    pairType,
    seedType,
    seed
  };
}

function updateAddress (seed: string, derivePath: string, seedType: SeedType, pairType: KeypairType): AddressState {
  const deriveError = deriveValidate(seed, derivePath, pairType);
  let isSeedValid = seedType === 'raw'
    ? rawValidate(seed)
    : mnemonicValidate(seed);
  let address: string | null = null;

  if (!deriveError && isSeedValid) {
    try {
      address = addressFromSeed(seed, derivePath, pairType);
    } catch (error) {
      isSeedValid = false;
    }
  }

  return {
    address,
    deriveError,
    derivePath,
    isSeedValid,
    pairType,
    seedType,
    seed
  };
}

function Create ({ className, onClose, onStatusChange, seed: propsSeed, t, type: propsType }: Props): React.ReactElement<Props> {
  const { isDevelopment } = useContext(ApiContext);
  const [{ address, deriveError, derivePath, isSeedValid, pairType, seed, seedType }, setAddress] = useState<AddressState>(generateSeed(propsSeed, '', propsSeed ? 'raw' : 'bip', propsType));
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [{ isNameValid, name }, setName] = useState({ isNameValid: true, name: 'new account' });
  const [{ isPassValid, password }, setPassword] = useState({ isPassValid: false, password: '' });
  const isValid = !!address && !deriveError && isNameValid && isPassValid && isSeedValid;

  const _onChangePass = (password: string): void =>
    setPassword({ isPassValid: keyring.isPassValid(password), password });
  const _onChangeDerive = (newDerivePath: string): void =>
    setAddress(updateAddress(seed, newDerivePath, seedType, pairType));
  const _onChangeSeed = (newSeed: string): void =>
    setAddress(updateAddress(newSeed, derivePath, seedType, pairType));
  const _onChangePairType = (newPairType: KeypairType): void =>
    setAddress(updateAddress(seed, derivePath, seedType, newPairType));
  const _selectSeedType = (newSeedType: SeedType): void => {
    if (newSeedType !== seedType) {
      setAddress(generateSeed(null, derivePath, newSeedType, pairType));
    }
  };
  const _onChangeName = (_name: string): void => {
    const name = _name.trim();

    setName({ isNameValid: !!name, name });
  };
  const _toggleConfirmation = (): void => setIsConfirmationOpen(!isConfirmationOpen);

  const _onCommit = (): void => {
    if (!isValid) {
      return;
    }

    // we will fill in all the details below
    const status = { action: 'create' } as ActionStatus;

    try {
      const { json, pair } = keyring.addUri(`${seed}${derivePath}`, password, { name, tags: [] }, pairType);
      const blob = new Blob([JSON.stringify(json)], { type: 'application/json; charset=utf-8' });
      const { address } = pair;

      FileSaver.saveAs(blob, `${address}.json`);

      status.account = address;
      status.status = pair ? 'success' : 'error';
      status.message = t('created account');

      InputAddress.setLastValue('account', address);
    } catch (error) {
      status.status = 'error';
      status.message = error.message;
    }

    _toggleConfirmation();
    onStatusChange(status);
    onClose();
  };

  return (
    <Modal
      className={className}
      dimmer='inverted'
      open
    >
      <Modal.Header>{t('Add an account via seed')}</Modal.Header>
      {address && isConfirmationOpen && (
        <CreateConfirmation
          address={address}
          name={name}
          onCommit={_onCommit}
          onClose={_toggleConfirmation}
        />
      )}
      <Modal.Content>
        <AddressRow
          defaultName={name}
          value={isSeedValid ? address : ''}
        >
          <Input
            autoFocus
            className='full'
            help={t('Name given to this account. You can edit it. To use the account to validate or nominate, it is a good practice to append the function of the account in the name, e.g "name_you_want - stash".')}
            isError={!isNameValid}
            label={t('name')}
            onChange={_onChangeName}
            onEnter={_onCommit}
            value={name}
          />
          <Input
            className='full'
            help={t('The private key for your account is derived from this seed. This seed must be kept secret as anyone in its possession has access to the funds of this account. If you validate, use the seed of the session account as the "--key" parameter of your node.')}
            isAction
            isError={!isSeedValid}
            isReadOnly={seedType === 'dev'}
            label={
              seedType === 'bip'
                ? t('mnemonic seed')
                : seedType === 'dev'
                  ? t('development seed')
                  : t('seed (hex or string)')
            }
            onChange={_onChangeSeed}
            onEnter={_onCommit}
            value={seed}
          >
            <Dropdown
              isButton
              defaultValue={seedType}
              onChange={_selectSeedType}
              options={
                (
                  isDevelopment
                    ? [{ value: 'dev', text: t('Development') }]
                    : []
                ).concat(
                  { value: 'bip', text: t('Mnemonic') },
                  { value: 'raw', text: t('Raw seed') }
                )
              }
            />
          </Input>
          <Password
            className='full'
            help={t('This password is used to encrypt your private key. It must be strong and unique! You will need it to sign transactions with this account. You can recover this account using this password together with the backup file (generated in the next step).')}
            isError={!isPassValid}
            label={t('password')}
            onChange={_onChangePass}
            onEnter={_onCommit}
            value={password}
          />
          <details
            className='accounts--Creator-advanced'
            open
          >
            <summary>{t('Advanced creation options')}</summary>
            <Dropdown
              defaultValue={pairType}
              help={t('Determines what cryptography will be used to create this account. Note that to validate on Polkadot, the session account must use "ed25519".')}
              label={t('keypair crypto type')}
              onChange={_onChangePairType}
              options={uiSettings.availableCryptos}
            />
            <Input
              className='full'
              help={t('You can set a custom derivation path for this account using the following syntax "/<soft-key>//<hard-key>". The "/<soft-key>" and "//<hard-key>" may be repeated and mixed`.')}
              isError={!!deriveError}
              label={t('secret derivation path')}
              onChange={_onChangeDerive}
              onEnter={_onCommit}
              value={derivePath}
            />
            {deriveError && (
              <article className='error'>{deriveError}</article>
            )}
          </details>
        </AddressRow>
      </Modal.Content>
      <Modal.Actions>
        <Button.Group>
          <Button
            icon='cancel'
            isNegative
            label={t('Cancel')}
            onClick={onClose}
          />
          <Button.Or />
          <Button
            icon='plus'
            isDisabled={!isValid}
            isPrimary
            label={t('Save')}
            onClick={_toggleConfirmation}
          />
        </Button.Group>
      </Modal.Actions>
    </Modal>
  );
}

export default translate(
  styled(Create)`
    .accounts--Creator-advanced {
      margin-top: 1rem;
    }
  `
);
