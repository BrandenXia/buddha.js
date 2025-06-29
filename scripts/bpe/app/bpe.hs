module Bpe (
  Token,
  BpeEncoded,
  TokenRec,
  BpeTable,
  toBpeEncoded,
  canCompress,
  buildBpeTable,
  buildBpeTable',
  findMax,
  compressOnce',
  compressOnce,
  compressBpe,
) where

import Data.List.Extra (dropEnd1, uncons)
import qualified Data.Map.Ordered as Map
import Data.Maybe (fromJust, maybeToList)

data Token
  = T Int
  | C Char
  deriving (Show, Eq, Ord)

type BpeEncoded = [Token]
type TokenRec = (Token, Token)
type BpeTable' = Map.OMap TokenRec Int
newtype BpeTable = BpeTable BpeTable'

instance Show BpeTable where
  show (BpeTable table)
    | Map.null table = "No BPE pairs found."
    | otherwise =
        dropEnd1 $ concatMap (uncurry showPair) $ Map.assocs table
   where
    showTokenFromBpe :: BpeTable' -> Token -> String
    showToken = showTokenFromBpe table
    showTokenFromBpe tbl (T i) = concatMap showToken (fst $ fromJust $ Map.elemAt tbl i)
    showTokenFromBpe _ (C c) = [c]
    showPair (l, r) v = concatMap showToken [l, r] ++ " -> " ++ show v ++ "\n"

toBpeEncoded :: String -> BpeEncoded
toBpeEncoded = map C

toPairs :: [a] -> [(a, a)]
toPairs t = zip t $ tail t

canCompress :: BpeEncoded -> Bool
canCompress = canCompress' [] . toPairs
 where
  canCompress' :: [TokenRec] -> [TokenRec] -> Bool
  canCompress' _ [] = False
  canCompress' seen (x : xs)
    | x `elem` seen = True
    | otherwise = canCompress' (seen ++ [x]) xs

buildBpeTable' :: BpeEncoded -> BpeTable'
buildBpeTable' = flip buildBpeTable'' Map.empty . toPairs
 where
  buildBpeTable'' :: [TokenRec] -> BpeTable' -> BpeTable'
  buildBpeTable'' [] = id
  buildBpeTable'' (x : xs) = Map.alter (Just . maybe 1 (+ 1)) x . buildBpeTable'' xs

buildBpeTable :: BpeEncoded -> BpeTable
buildBpeTable encoded = BpeTable $ buildBpeTable' encoded

findMax :: BpeTable' -> Maybe (TokenRec, Int, Token)
findMax table
  | Map.null table = Nothing
  | otherwise = Just $ (\(k, v, i, _) -> (k, v, T i)) $ foldl maxPair (firstPair table) tokens
 where
  tokens = Map.assocs table
  firstPair = (\(k, v) -> (k, v, 0, 0)) . head . Map.assocs
  maxPair (prevK, prevV, maxIdx, currIdx) (k, v) = if v > prevV then (k, v, currIdx, currIdx + 1) else (prevK, prevV, maxIdx, currIdx + 1)

traverseThree :: [a] -> b -> ([a] -> Maybe a -> a -> Maybe a -> [a] -> Int -> b -> ([a], Int, b)) -> ([a], b)
traverseThree xs additional f = traverseThree' xs additional f 0
 where
  traverseThree' xs' additional' f' i
    | i >= len = (xs', additional')
    | otherwise =
        let
          prevAll = take (i - 1) xs'
          prevOne = if i > 0 then Just (xs' !! (i - 1)) else Nothing
          current = xs' !! i
          nextOne = if i + 1 < len then Just (xs' !! (i + 1)) else Nothing
          nextAll = drop (i + 2) xs'
          (xs'', i', additional'') = f' prevAll prevOne current nextOne nextAll i additional'
         in
          traverseThree' xs'' additional'' f' i'
   where
    len = length xs'

compressOnce' :: (TokenRec, Token) -> BpeEncoded -> BpeTable' -> (BpeEncoded, BpeTable')
compressOnce' (pair, token) encoded table = traverseThree encoded table compressPair
 where
  compressPair :: [Token] -> Maybe Token -> Token -> Maybe Token -> [Token] -> Int -> BpeTable' -> ([Token], Int, BpeTable')
  compressPair prevAll prevOne current Nothing nextAll i tbl = (prevAll ++ maybeToList prevOne ++ [current] ++ nextAll, i + 1, tbl)
  compressPair prevAll prevOne current (Just nextOne) nextAll i tbl
    | (current, nextOne) == pair = (prevAll ++ maybeToList prevOne ++ [token] ++ nextAll, i + 1, tbl')
    | otherwise = (prevAll ++ maybeToList prevOne ++ [current, nextOne] ++ nextAll, i + 1, tbl')
   where
    tupleIfJust (Just l) (Just r) = [(l, r)]
    tupleIfJust _ _ = []
    toTokenPairs = concatMap $ uncurry tupleIfJust
    nextNextOne = fst <$> uncons nextAll
    keysToIncr = toTokenPairs [(prevOne, Just token), (Just token, nextNextOne)]
    keysToDecr = toTokenPairs [(prevOne, Just current), (Just current, Just nextOne), (Just current, nextNextOne)]

    alterKeys f = foldr ((.) . Map.alter f) id
    incrementKeys = alterKeys (pure . maybe 1 (1 +))
    decrementKeys = alterKeys (pure . maybe 0 (subtract 1))

    tbl' = incrementKeys keysToIncr . decrementKeys keysToDecr $ tbl

compressOnce :: (TokenRec, Token) -> BpeEncoded -> BpeTable' -> (BpeEncoded, BpeTable)
compressOnce (pair, token) encoded table =
  let (encoded', table') = compressOnce' (pair, token) encoded table
   in (encoded', BpeTable table')

compressBpe' :: BpeEncoded -> (BpeEncoded, BpeTable')
compressBpe' encoded = compressBpe'' encoded $ buildBpeTable' encoded
 where
  compressBpe'' :: BpeEncoded -> BpeTable' -> (BpeEncoded, BpeTable')
  compressBpe'' enc table =
    case findMax table of
      Nothing -> original
      Just (_, 1, _) -> original
      Just (pair, _, token) -> uncurry compressBpe'' $ compressOnce' (pair, token) enc table
   where
    original = (enc, table)

compressBpe :: BpeEncoded -> (BpeEncoded, BpeTable)
compressBpe encoded =
  let (compressed, table) = compressBpe' encoded
   in (compressed, BpeTable table)
